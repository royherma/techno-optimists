import { Hono } from 'hono'
import { z } from 'zod'
import {
  ACTION_KINDS, CHALLENGE_TYPES, EMPTY_ACTIONS, FEED_SORTS, HELP_KINDS,
  type ActionKind, type Challenge, type Media, type Update,
} from '../../../packages/types/index'

type Env = {
  DB: D1Database
  ANALYTICS_DB?: D1Database
  CACHE?: KVNamespace
  ASSETS?: Fetcher
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

// No auth yet, so the actor is passed explicitly and must already exist. This
// endpoint gets an auth guard the same day sign-in lands - it is not open by design.
app.post('/api/challenges/:slug/action', async (c) => {
  const parsed = actionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { kind, help_kind, note } = parsed.data

  const personId = c.req.header('x-person-id')
  if (!personId) return c.json({ error: 'no_actor', hint: 'send x-person-id until auth ships' }, 401)

  const challenge = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!challenge) return c.json({ error: 'not_found' }, 404)
  const person = await c.env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(personId).first()
  if (!person) return c.json({ error: 'unknown_person' }, 401)

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
