import { Hono } from 'hono'
import { z } from 'zod'
import {
  SESSION_COOKIE, clearCookie, cookie, currentPerson, handleFromEmail, hashToken,
  linkExpiry, mintToken, nameFromEmail, normalizeEmail, readCookie, sessionExpiry,
} from './auth'
import {
  ACTION_KINDS, CHALLENGE_TYPES, EMPTY_ACTIONS, FEED_SORTS, HELP_KINDS,
  type ActionKind, type Challenge, type Media, type Update,
} from '../../../packages/types/index'

type Env = {
  DB: D1Database
  ANALYTICS_DB?: D1Database
  CACHE?: KVNamespace
  ASSETS?: Fetcher
  MEDIA?: R2Bucket
  ENVIRONMENT?: string
  /** Absent in dev: the magic link is logged instead of emailed. */
  RESEND_API_KEY?: string
  /** From address for magic links. Falls back to the Resend sandbox sender. */
  MAIL_FROM?: string
}

const app = new Hono<{ Bindings: Env }>()

export const json = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string') return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/**
 * True action counts from challenge_actions, plus the seeded demo scale.
 * seed_actions exists only until real traffic lands - see packages/db/schema.sql.
 */
export const mergeActions = (real: Record<string, number>, seedRaw: unknown) => {
  const seed = json<Partial<Record<ActionKind, number>>>(seedRaw, {})
  const out = { ...EMPTY_ACTIONS }
  for (const k of ACTION_KINDS) out[k] = (real[k] ?? 0) + (seed[k] ?? 0)
  return out
}

type Row = Record<string, unknown>

const toChallenge = (r: Row, actionRows: Row[]): Challenge => {
  const real: Record<string, number> = {}
  for (const a of actionRows) real[String(a.kind)] = Number(a.n)
  return {
    id: String(r.id),
    slug: String(r.slug),
    type: r.type as Challenge['type'],
    stage: r.stage as Challenge['stage'],
    title: String(r.title),
    summary: String(r.summary),
    body: r.body == null ? null : String(r.body),
    media: json<Media[]>(r.media, []),
    location: r.location == null ? null : String(r.location),
    tags: json<string[]>(r.tags, []),
    author: {
      id: String(r.author_id),
      handle: String(r.author_handle),
      name: String(r.author_name),
      avatar_url: r.author_avatar == null ? null : String(r.author_avatar),
      location: r.author_location == null ? null : String(r.author_location),
    },
    actions: mergeActions(real, r.seed_actions),
    updates_count: Number(r.updates_count ?? 0),
    created_at: String(r.created_at),
    last_activity_at: String(r.last_activity_at),
  }
}

const SELECT_CHALLENGE = `
  SELECT c.*, p.handle author_handle, p.name author_name,
         p.avatar_url author_avatar, p.location author_location,
         (SELECT COUNT(*) FROM updates u WHERE u.challenge_id = c.id) updates_count
  FROM challenges c JOIN people p ON p.id = c.author_id`

const feedQuery = z.object({
  sort: z.enum(FEED_SORTS).default('active'),
  type: z.enum(CHALLENGE_TYPES).optional(),
  tag: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).default(0),
})

app.get('/api/challenges', async (c) => {
  const parsed = feedQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'bad_query', detail: parsed.error.issues }, 400)
  const { sort, type, tag, limit, offset } = parsed.data

  const where: string[] = []
  const binds: unknown[] = []
  if (type) { where.push('c.type = ?'); binds.push(type) }
  // tags is a json array; LIKE on the serialized form is fine at this size and
  // avoids a join table we would only need once the corpus is large.
  if (tag) { where.push('c.tags LIKE ?'); binds.push(`%"${tag}"%`) }

  const order = sort === 'new' ? 'c.created_at DESC'
    : sort === 'needs_help' ? 'updates_count ASC, c.last_activity_at DESC'
    : 'c.last_activity_at DESC'

  const sql = `${SELECT_CHALLENGE}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${order} LIMIT ? OFFSET ?`

  const { results } = await c.env.DB.prepare(sql).bind(...binds, limit + 1, offset).all()
  const rows = (results ?? []) as Row[]
  const page = rows.slice(0, limit)

  const ids = page.map((r) => String(r.id))
  const counts = ids.length
    ? await c.env.DB.prepare(
        `SELECT challenge_id, kind, COUNT(*) n FROM challenge_actions
         WHERE challenge_id IN (${ids.map(() => '?').join(',')}) GROUP BY challenge_id, kind`,
      ).bind(...ids).all()
    : { results: [] }

  const byChallenge = new Map<string, Row[]>()
  for (const a of ((counts.results ?? []) as Row[])) {
    const k = String(a.challenge_id)
    byChallenge.set(k, [...(byChallenge.get(k) ?? []), a])
  }

  return c.json({
    challenges: page.map((r) => toChallenge(r, byChallenge.get(String(r.id)) ?? [])),
    next_cursor: rows.length > limit ? String(offset + limit) : null,
  })
})

app.get('/api/challenges/:slug', async (c) => {
  const slug = c.req.param('slug')
  const row = await c.env.DB.prepare(`${SELECT_CHALLENGE} WHERE c.slug = ?`).bind(slug).first()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const [counts, updates, helpers] = await Promise.all([
    c.env.DB.prepare('SELECT kind, COUNT(*) n FROM challenge_actions WHERE challenge_id = ? GROUP BY kind').bind(row.id).all(),
    c.env.DB.prepare(
      `SELECT u.*, p.handle author_handle, p.name author_name, p.avatar_url author_avatar
       FROM updates u JOIN people p ON p.id = u.author_id
       WHERE u.challenge_id = ? ORDER BY u.created_at ASC`).bind(row.id).all(),
    c.env.DB.prepare(
      `SELECT p.id, p.handle, p.name, p.avatar_url, p.location, p.skills, p.roles,
              GROUP_CONCAT(a.kind) kinds, MAX(a.created_at) latest
       FROM challenge_actions a JOIN people p ON p.id = a.person_id
       WHERE a.challenge_id = ? AND a.kind IN ('can_help','will_test','building_this')
       GROUP BY p.id
       ORDER BY latest DESC LIMIT 12`).bind(row.id).all(),
  ])

  const challenge = toChallenge(row as Row, (counts.results ?? []) as Row[])
  return c.json({
    challenge,
    updates: ((updates.results ?? []) as Row[]).map((u): Update => ({
      id: String(u.id),
      challenge_id: String(u.challenge_id),
      author: {
        id: String(u.author_id), handle: String(u.author_handle),
        name: String(u.author_name),
        avatar_url: u.author_avatar == null ? null : String(u.author_avatar),
      },
      stage: (u.stage ?? null) as Update['stage'],
      body: String(u.body),
      media: json<Media[]>(u.media, []),
      created_at: String(u.created_at),
    })),
    people: ((helpers.results ?? []) as Row[]).map((p) => ({
      id: String(p.id), handle: String(p.handle), name: String(p.name),
      avatar_url: p.avatar_url == null ? null : String(p.avatar_url),
      location: p.location == null ? null : String(p.location),
      skills: json<string[]>(p.skills, []),
      roles: json<string[]>(p.roles, []),
      kinds: String(p.kinds ?? '').split(',').filter(Boolean) as ActionKind[],
    })),
  })
})

const actionBody = z.object({
  kind: z.enum(ACTION_KINDS),
  help_kind: z.enum(HELP_KINDS).optional(),
  note: z.string().max(500).optional(),
})

// Requires a session. The actor is the signed-in person and cannot be spoofed
// by a header - see apps/api/src/auth.ts.
app.post('/api/challenges/:slug/action', async (c) => {
  const parsed = actionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { kind, help_kind, note } = parsed.data

  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  const personId = me.id

  const challenge = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!challenge) return c.json({ error: 'not_found' }, 404)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO challenge_actions (challenge_id, person_id, kind, help_kind, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (challenge_id, person_id, kind) DO UPDATE SET
         help_kind = excluded.help_kind, note = excluded.note`,
    ).bind(challenge.id, personId, kind, help_kind ?? null, note ?? null),
    c.env.DB.prepare("UPDATE challenges SET last_activity_at = datetime('now') WHERE id = ?").bind(challenge.id),
  ])

  const counts = await c.env.DB.prepare(
    'SELECT kind, COUNT(*) n FROM challenge_actions WHERE challenge_id = ? GROUP BY kind',
  ).bind(challenge.id).all()
  const seed = await c.env.DB.prepare('SELECT seed_actions FROM challenges WHERE id = ?').bind(challenge.id).first()

  const real: Record<string, number> = {}
  for (const a of ((counts.results ?? []) as Row[])) real[String(a.kind)] = Number(a.n)
  return c.json({ ok: true, actions: mergeActions(real, seed?.seed_actions) })
})

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

const emailBody = z.object({ email: z.string().email().max(254) })

/**
 * Sends a magic link. Always answers the same way whether or not the address is
 * known - the response must not reveal who has an account here.
 */
app.post('/api/auth/request', async (c) => {
  const parsed = emailBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_email' }, 400)
  const email = normalizeEmail(parsed.data.email)

  // One live link per address at a time: requesting a second invalidates the
  // first, so a forwarded old email cannot be used to take the account.
  const token = mintToken()
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE email = ? AND used_at IS NULL").bind(email),
    c.env.DB.prepare('INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)')
      .bind(await hashToken(token), email, linkExpiry()),
  ])

  const link = `${new URL(c.req.url).origin}/api/auth/callback?token=${token}`
  const sent = await sendMagicLink(c.env, email, link)

  // In dev there is no mail key, so the link goes to the Worker log. Never in prod.
  if (!sent) console.log(`[auth] magic link for ${email}: ${link}`)
  return c.json({ ok: true, sent, ...(sent ? {} : { dev_link: link }) })
})

/** Returns true if the mail actually went out. */
const sendMagicLink = async (env: Env, email: string, link: string): Promise<boolean> => {
  if (!env.RESEND_API_KEY) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM ?? 'Techno Optimists <onboarding@resend.dev>',
      to: email,
      subject: 'Your sign-in link',
      text: `Sign in to Techno Optimists:\n\n${link}\n\nThis link works once and expires in 15 minutes.`,
    }),
  })
  if (!res.ok) {
    console.log(`[auth] resend failed ${res.status}: ${await res.text()}`)
    return false
  }
  return true
}

/**
 * Redeems a link and starts a session. Creates the person on first click - this
 * is the only place a person row is born.
 */
app.get('/api/auth/callback', async (c) => {
  const token = new URL(c.req.url).searchParams.get('token')
  if (!token) return c.redirect('/signin?error=missing', 302)

  const hash = await hashToken(token)
  const link = await c.env.DB.prepare(
    "SELECT email FROM magic_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')",
  ).bind(hash).first()
  if (!link) return c.redirect('/signin?error=expired', 302)

  const email = String(link.email)
  let person = await c.env.DB.prepare(
    'SELECT p.id FROM identities i JOIN people p ON p.id = i.person_id WHERE i.email = ?',
  ).bind(email).first()

  if (!person) {
    const id = `p_${mintToken().slice(0, 16)}`
    const handle = await uniqueHandle(c.env.DB, handleFromEmail(email))
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO people (id, handle, name) VALUES (?, ?, ?)')
        .bind(id, handle, nameFromEmail(email)),
      c.env.DB.prepare('INSERT INTO identities (person_id, email) VALUES (?, ?)').bind(id, email),
    ])
    person = { id }
  }

  const session = mintToken()
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE token_hash = ?").bind(hash),
    c.env.DB.prepare('INSERT INTO sessions (token_hash, person_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(session), person.id, sessionExpiry(), c.req.header('user-agent') ?? null),
    c.env.DB.prepare("UPDATE identities SET last_login_at = datetime('now') WHERE email = ?").bind(email),
  ])

  c.header('set-cookie', cookie(session, new URL(c.req.url).protocol === 'https:'))
  return c.redirect('/', 302)
})

/** First free handle: mei, mei2, mei3... Races are caught by the UNIQUE index. */
const uniqueHandle = async (db: D1Database, base: string) => {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}${n}`
    const taken = await db.prepare('SELECT 1 FROM people WHERE handle = ?').bind(candidate).first()
    if (!taken) return candidate
  }
  return `${base}${mintToken().slice(0, 6)}`
}

app.get('/api/auth/me', async (c) => {
  const me = await currentPerson(c)
  return c.json({ person: me })
})

app.post('/api/auth/signout', async (c) => {
  const token = readCookie(c.req.header('cookie'), SESSION_COOKIE)
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  }
  c.header('set-cookie', clearCookie(new URL(c.req.url).protocol === 'https:'))
  return c.json({ ok: true })
})

app.get('/api/health', async (c) => {
  const r = await c.env.DB.prepare('SELECT COUNT(*) n FROM challenges').first<{ n: number }>()
  return c.json({ ok: true, challenges: r?.n ?? 0 })
})

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

export { app }
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(req, env, ctx)
  },
}
