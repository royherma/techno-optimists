import { SCOUT_FEEDS, recentSourceRuns, sourceRunPage, summarizeSources } from './scout-sources'
import { runScout, SCOUT_CRON } from './scout-cloudflare'
import { appendScoutRows, ScoutInputError } from './scout-import'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  HANDLE_MAX, HANDLE_MIN, SESSION_COOKIE, clearCookie, cookie, currentPerson,
  handleFromEmail, handleProblem, hashToken, linkExpiry, mintToken, nameFromEmail,
  normalizeEmail, normalizeHandle, readCookie, sessionExpiry, signalCookie,
} from './auth'
import { isAdminEmail } from './admin'
import { track } from './analytics'
import { community } from './community'
import { notify } from './slack'
import { MAX_BYTES, checkUpload, dimensionsOf, mediaKey, mediaUrl } from './media'
import { slugify } from './slug'
import {
  ACTION_KINDS, CHALLENGE_TYPES, EMPTY_ACTIONS, FEED_SORTS, HELP_KINDS, ROLES, STAGES,
  type ActionKind, type Challenge, type Media, type Update,
} from '../../../packages/types/index'

type Env = {
  AI?: Cloudflare.Env['AI']
  SCOUT_ENABLED?: string
  DB: D1Database
  /**
   * Provisioned before there was anything to write and never wired up - the
   * schema in packages/db/schema-analytics.sql was never applied, so both
   * to-analytics and to-analytics-dev hold no tables at all. Kept bound rather
   * than deleted, but ANALYTICS below is what actually records traffic: a D1
   * write per pageview serialises on a single-threaded database and burns the
   * 100k rows/day free write quota, which is the wrong shape for telemetry.
   */
  ANALYTICS_DB?: D1Database
  /**
   * Workers Analytics Engine. Optional so every test and the build-time API
   * (wrangler.build.jsonc binds no dataset) run without it.
   */
  ANALYTICS?: AnalyticsEngineDataset
  CACHE?: KVNamespace
  ASSETS?: Fetcher
  MEDIA?: R2Bucket
  ENVIRONMENT?: string
  /** Absent in dev: the magic link is logged instead of emailed. */
  RESEND_API_KEY?: string
  /** From address for magic links. Falls back to the Resend sandbox sender. */
  MAIL_FROM?: string
  /**
   * Comma-separated admin addresses. A secret rather than a var so the list is
   * not in this public repo, and so changing it needs no deploy. Unset means no
   * admins, which is what a fresh clone should get. See src/admin.ts.
   */
  ADMIN_EMAILS?: string
  /**
   * Slack alerts (src/slack.ts). One bot token for the whole workspace, shared
   * with the other projects. Every channel id is optional and an unset one
   * skips that channel rather than defaulting to another, so a half-configured
   * env is quiet instead of noisy in the wrong place.
   */
  SLACK_BOT_TOKEN?: string
  SLACK_CHANNEL_GROWTH?: string
  SLACK_CHANNEL_PRODUCT?: string
  SLACK_CHANNEL_ALERTS?: string
}

const app = new Hono<{ Bindings: Env }>()

/**
 * The only place an unhandled throw becomes a response.
 *
 * Without this, Hono answers a thrown error with a bare `Internal Server Error`
 * and nothing reaches the log with it. That is not hypothetical: prod sign-in
 * 500'd on `no such column: is_admin` (docs/CONSTRAINTS.md, "Database") and the
 * response carried no hint of which query, which column, or which request -
 * the cause had to be found by reading source. One log line here would have
 * named it.
 *
 * The client gets a ray and nothing else. `err.message` is a D1 error string:
 * it names columns and tables, so it belongs in the log, never in the body.
 * The ray is the join key - `wrangler tail --env prod --search <ray>` pulls the
 * full line, and a user can paste the ray into a bug report without leaking
 * anything about the schema.
 */
app.onError((err, c) => {
  const ray = c.req.header('cf-ray') ?? 'no-ray'
  // One line, one JSON object: Workers Logs indexes the fields, so this is
  // filterable by path or ray in the dashboard rather than grep-only.
  console.error(JSON.stringify({
    level: 'error',
    ray,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  }))
  return c.json({ error: 'server_error', ray }, 500)
})

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
    // Number(null) is 0, which would drop every unplaced Challenge onto the
    // Gulf of Guinea. The null has to survive the whole way to the map.
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
    tags: json<string[]>(r.tags, []),
    emoji: r.emoji == null ? null : String(r.emoji),
    // Number(null) would report every unspecified Challenge as impact 0, which
    // is not a tier. The null has to reach the surfaces so they can leave the
    // rings unmarked rather than drawing a smallest-scope ring.
    impact: r.impact == null ? null : Number(r.impact),
    // Three nullable columns collapse to one nullable object: a row with no
    // provenance returns `source: null` rather than an object of three nulls,
    // so `c.source &&` is the only check a surface needs. A row that has any
    // one of them keeps the other two as null - citing an outlet with no link
    // is a real state, and so is a bare URL.
    source: r.source_url == null && r.source_name == null && r.source_note == null
      ? null
      : {
          url: r.source_url == null ? null : String(r.source_url),
          name: r.source_name == null ? null : String(r.source_name),
          note: r.source_note == null ? null : String(r.source_note),
        },
    imported_at: r.imported_at == null ? null : String(r.imported_at),
    // No `name`. The public identity is the handle - see the Person type.
    author: {
      id: String(r.author_id),
      handle: String(r.author_handle),
      avatar_url: r.author_avatar == null ? null : String(r.author_avatar),
      location: r.author_location == null ? null : String(r.author_location),
    },
    actions: mergeActions(real, r.seed_actions),
    updates_count: Number(r.updates_count ?? 0),
    views_count: Number(r.views_count ?? 0),
    created_at: String(r.created_at),
    last_activity_at: String(r.last_activity_at),
  }
}

const SELECT_CHALLENGE = `
  SELECT c.*, p.handle author_handle,
         p.avatar_url author_avatar, p.location author_location,
         (SELECT COUNT(*) FROM updates u WHERE u.challenge_id = c.id) updates_count,
         (SELECT COUNT(*) FROM challenge_views v WHERE v.challenge_id = c.id) views_count
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

// 20000 is past any real camera and short of a number that could be used to
// make a layout allocate something absurd.
const pixels = z.number().int().positive().max(20_000).optional()

const mediaItem = z.object({
  kind: z.enum(['image', 'video']),
  url: z.string().max(500),
  w: pixels,
  h: pixels,
  tint: z.string().max(20).optional(),
  alt: z.string().max(300).optional(),
})

const createBody = z.object({
  type: z.enum(CHALLENGE_TYPES),
  title: z.string().trim().min(8).max(140),
  summary: z.string().trim().min(10).max(280),
  body: z.string().max(20_000).optional(),
  media: z.array(mediaItem).max(8).default([]),
  location: z.string().max(120).optional(),
  // Bounded to the real ranges rather than left as free numbers: a client that
  // sends degrees-times-1e7, or swaps the pair, is a bug worth rejecting at the
  // door rather than storing and discovering later as a pin in the wrong ocean.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(2).max(30)).max(6).default([]),
  // The ring count, not a tier name. Omitted means unspecified, which is the
  // common case and stays NULL rather than defaulting to 1.
  impact: z.number().int().min(1).max(5).optional(),
})

/**
 * Creates a Challenge. The stage is always 'spot' - a Challenge enters the
 * world by being noticed, and moves on only through updates. The type is what
 * the author says it is and is kept for life.
 */
app.post('/api/challenges', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)

  const parsed = createBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { type, title, summary, body, media, location, lat, lng, tags, impact } = parsed.data

  const id = `c_${mintToken().slice(0, 16)}`
  const slug = await uniqueSlug(c.env.DB, slugify(title))

  // A half-pair is not a position, so one without the other is stored as
  // neither. Zod validates each number alone; only this pairing makes them mean
  // a place.
  const placed = lat != null && lng != null

  await c.env.DB.prepare(
    `INSERT INTO challenges (id, slug, type, stage, title, summary, body, media, location, lat, lng, tags, author_id, impact)
     VALUES (?, ?, ?, 'spot', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, slug, type, title, summary, body ?? null,
    JSON.stringify(media), location ?? null,
    placed ? lat : null, placed ? lng : null,
    JSON.stringify([...new Set(tags)]), me.id, impact ?? null,
  ).run()

  const row = await c.env.DB.prepare(`${SELECT_CHALLENGE} WHERE c.id = ?`).bind(id).first()
  notify(c, 'challenge_created', { slug, title, type, author: me.handle ?? me.id })
  return c.json({ ok: true, challenge: toChallenge(row as Row, []) }, 201)
})

/**
 * One row in a bulk import. Differs from createBody in exactly three ways, and
 * each one is why this route exists rather than looping the public one:
 *  - `stage` is settable. A researched Challenge is often already understood or
 *    has known ideas; forcing every imported row to 'spot' would throw away the
 *    one thing the research established.
 *  - `source_*` is settable, and `source_url` is effectively required by
 *    convention - see the route.
 *  - `created_at`/`last_activity_at` are settable, so a problem reported in a
 *    2024 paper does not land on the feed as today's news.
 */
const importRow = createBody.extend({
  // Editorial title corrections must preserve the original public address.
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180).optional(),
  stage: z.enum(STAGES).default('spot'),
  source_url: z.string().trim().max(500).optional(),
  source_name: z.string().trim().max(120).optional(),
  source_note: z.string().trim().max(2_000).optional(),
  // Accepted as any string SQLite's datetime() understands rather than a strict
  // ISO shape, because 'now' and '2026-03-01' are both things an import file
  // reasonably carries. Bad values surface as a NULL from datetime(), which the
  // route rejects rather than storing.
  created_at: z.string().max(40).optional(),
  last_activity_at: z.string().max(40).optional(),
  /** Demo scale, same meaning as challenges.seed_actions. */
  seed_actions: z.record(z.enum(ACTION_KINDS), z.number().int().min(0)).optional(),
})

const importBody = z.object({
  create_only: z.boolean().default(false),
  /**
   * The handle every row in this batch is authored by. Must already exist -
   * the route will not create people, because a typo'd handle silently minting
   * a new account is how an import ends up with rows nobody can find.
   */
  author: z.string().trim().min(HANDLE_MIN).max(HANDLE_MAX),
  /**
   * Report what would happen and write nothing. The default is true on purpose:
   * the destructive direction should be the one you have to ask for by name.
   */
  dry_run: z.boolean().default(true),
  challenges: z.array(importRow).min(1).max(100),
})

/**
 * Bulk-imports researched Challenges under one author. Admin only.
 *
 * This is the CLI's endpoint - see scripts/import-challenges.mjs. It exists
 * because the public create route is deliberately narrow: it stamps 'spot',
 * stamps now, and attributes to the caller, all of which are correct for a
 * person posting their own problem and all of which are wrong for a batch of
 * sourced research.
 *
 * Idempotent on slug. Re-running the same file updates the rows it already
 * created rather than making a second copy with a `-2` suffix, so fixing a typo
 * in an import file is a re-run and not a cleanup job.
 */
app.post('/api/challenges/import', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  // Not a 404-as-403: an admin route that 403s tells an attacker only that it
  // exists, which is already public in this open-source repo.
  if (!me.is_admin) return c.json({ error: 'admin_only' }, 403)

  const parsed = importBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { author, dry_run, challenges, create_only } = parsed.data

  const authorRow = await c.env.DB.prepare('SELECT id FROM people WHERE handle = ?')
    .bind(normalizeHandle(author)).first<{ id: string }>()
  if (!authorRow) return c.json({ error: 'unknown_author', handle: author }, 400)
  if (create_only) {
    try {
      const plan = await appendScoutRows(c.env.DB, authorRow.id, challenges, dry_run)
      return c.json({ ok: true, create_only: true, dry_run, author: normalizeHandle(author), plan }, dry_run ? 200 : 201)
    } catch (error) {
      if (error instanceof ScoutInputError) return c.json({ error: error.message }, 400)
      throw error
    }
  }


  // Every row is checked before any row is written. A batch that fails halfway
  // leaves a partial import that looks exactly like a successful smaller one.
  const planned: {
    slug: string; existing: string | null; row: z.infer<typeof importRow>
  }[] = []
  const problems: { index: number; error: string; detail?: string }[] = []

  for (const [i, row] of challenges.entries()) {
    // A row logged on someone else's behalf with no stated source is the exact
    // thing these columns exist to prevent. Refused rather than defaulted.
    if (!row.source_url && !row.source_name) {
      problems.push({ index: i, error: 'no_source', detail: row.title })
      continue
    }
    const slug = row.slug ?? slugify(row.title)
    if (!slug) { problems.push({ index: i, error: 'untitled', detail: row.title }); continue }
    if (planned.some((p) => p.slug === slug)) {
      problems.push({ index: i, error: 'duplicate_in_batch', detail: slug })
      continue
    }
    const existing = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?')
      .bind(slug).first<{ id: string }>()
    planned.push({ slug, existing: existing?.id ?? null, row })
  }

  if (problems.length) return c.json({ error: 'bad_rows', problems }, 400)

  const plan = planned.map((p) => ({
    slug: p.slug, action: p.existing ? ('update' as const) : ('create' as const),
  }))
  if (dry_run) {
    return c.json({ ok: true, dry_run: true, author: normalizeHandle(author), plan })
  }

  const writes = planned.map(({ slug, existing, row }) => {
    const placed = row.lat != null && row.lng != null
    const media = JSON.stringify(row.media)
    const tags = JSON.stringify([...new Set(row.tags)])
    const seedActions = JSON.stringify(row.seed_actions ?? {})
    // datetime() normalizes whatever the file carried and answers NULL for
    // anything it cannot read; COALESCE turns that into now rather than a NOT
    // NULL violation halfway through a batch.
    const created = row.created_at ?? 'now'
    const active = row.last_activity_at ?? row.created_at ?? 'now'

    return existing
      ? c.env.DB.prepare(
          `UPDATE challenges SET type=?, stage=?, title=?, summary=?, body=?, media=?,
             location=?, lat=?, lng=?, tags=?, author_id=?, impact=?,
             created_at=COALESCE(datetime(?), created_at),
             last_activity_at=COALESCE(datetime(?), last_activity_at),
             seed_actions=?, source_url=?, source_name=?, source_note=?,
             imported_at=datetime('now')
           WHERE id=?`,
        ).bind(
          row.type, row.stage, row.title, row.summary, row.body ?? null, media,
          row.location ?? null, placed ? row.lat : null, placed ? row.lng : null,
          tags, authorRow.id, row.impact ?? null, created, active, seedActions,
          row.source_url ?? null, row.source_name ?? null, row.source_note ?? null,
          existing,
        )
      : c.env.DB.prepare(
          `INSERT INTO challenges (id, slug, type, stage, title, summary, body, media,
             location, lat, lng, tags, author_id, impact, created_at, last_activity_at,
             seed_actions, source_url, source_name, source_note, imported_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             COALESCE(datetime(?), datetime('now')),
             COALESCE(datetime(?), datetime('now')),
             ?, ?, ?, ?, datetime('now'))`,
        ).bind(
          `c_${mintToken().slice(0, 16)}`, slug, row.type, row.stage, row.title,
          row.summary, row.body ?? null, media, row.location ?? null,
          placed ? row.lat : null, placed ? row.lng : null, tags, authorRow.id,
          row.impact ?? null, created, active, seedActions,
          row.source_url ?? null, row.source_name ?? null, row.source_note ?? null,
        )
  })

  await c.env.DB.batch(writes)
  return c.json({ ok: true, dry_run: false, author: normalizeHandle(author), plan }, 201)
})

/** Slugs are permanent, so a clash gets a numeric suffix rather than a rewrite. */
const uniqueSlug = async (db: D1Database, base: string) => {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const taken = await db.prepare('SELECT 1 FROM challenges WHERE slug = ?').bind(candidate).first()
    if (!taken) return candidate
  }
  return `${base}-${mintToken().slice(0, 6)}`
}

const updateBody = z.object({
  body: z.string().trim().min(1).max(20_000),
  stage: z.enum(STAGES).optional(),
  media: z.array(mediaItem).max(8).default([]),
})

/**
 * Appends to the progress log. An update carrying a stage moves the Challenge -
 * that is the only way the lifecycle advances, so progress is always evidenced
 * by someone saying what happened.
 */
app.post('/api/challenges/:slug/updates', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)

  const parsed = updateBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { body, stage, media } = parsed.data

  const challenge = await c.env.DB.prepare('SELECT id, author_id FROM challenges WHERE slug = ?')
    .bind(c.req.param('slug')).first()
  if (!challenge) return c.json({ error: 'not_found' }, 404)

  // Anyone signed in may post an update - that is the collaboration. Moving the
  // Challenge along its lifecycle is a different act: it rewrites the object
  // itself, and it belongs to whoever owns it. Without this, any signed-in
  // stranger could mark someone else's Challenge Learn and it would read as the
  // author saying so.
  if (stage && String(challenge.author_id) !== me.id && !me.is_admin) {
    return c.json({ error: 'not_yours' }, 403)
  }

  const id = `u_${mintToken().slice(0, 16)}`
  const writes = [
    c.env.DB.prepare(
      'INSERT INTO updates (id, challenge_id, author_id, stage, body, media) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, challenge.id, me.id, stage ?? null, body, JSON.stringify(media)),
    c.env.DB.prepare("UPDATE challenges SET last_activity_at = datetime('now') WHERE id = ?").bind(challenge.id),
  ]
  if (stage) {
    writes.push(c.env.DB.prepare('UPDATE challenges SET stage = ? WHERE id = ?').bind(stage, challenge.id))
  }
  await c.env.DB.batch(writes)

  return c.json({ ok: true, id, stage: stage ?? null }, 201)
})

app.route('/api/challenges', community)

app.get('/api/challenges/:slug', async (c) => {
  const slug = c.req.param('slug')
  const row = await c.env.DB.prepare(`${SELECT_CHALLENGE} WHERE c.slug = ?`).bind(slug).first()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const [counts, updates, helpers] = await Promise.all([
    c.env.DB.prepare('SELECT kind, COUNT(*) n FROM challenge_actions WHERE challenge_id = ? GROUP BY kind').bind(row.id).all(),
    c.env.DB.prepare(
      `SELECT u.*, p.handle author_handle, p.avatar_url author_avatar
       FROM updates u JOIN people p ON p.id = u.author_id
       WHERE u.challenge_id = ? ORDER BY u.created_at ASC`).bind(row.id).all(),
    c.env.DB.prepare(
      `SELECT p.id, p.handle, p.avatar_url, p.location, p.skills, p.roles,
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
        avatar_url: u.author_avatar == null ? null : String(u.author_avatar),
      },
      stage: (u.stage ?? null) as Update['stage'],
      body: String(u.body),
      media: json<Media[]>(u.media, []),
      created_at: String(u.created_at),
    })),
    people: ((helpers.results ?? []) as Row[]).map((p) => ({
      id: String(p.id), handle: String(p.handle),
      avatar_url: p.avatar_url == null ? null : String(p.avatar_url),
      location: p.location == null ? null : String(p.location),
      skills: json<string[]>(p.skills, []),
      roles: json<string[]>(p.roles, []),
      kinds: String(p.kinds ?? '').split(',').filter(Boolean) as ActionKind[],
    })),
  })
})

// Personalized state is never shared through a browser or edge cache.
app.get('/api/challenges/:slug/actions/me', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const me = await currentPerson(c)
  if (!me) return c.json({ mine: [] })
  const rows = await c.env.DB.prepare(
    `SELECT a.kind FROM challenge_actions a JOIN challenges c ON c.id = a.challenge_id
     WHERE c.slug = ? AND a.person_id = ?`,
  ).bind(c.req.param('slug'), me.id).all()
  return c.json({ mine: rows.results.map((r) => r.kind) })
})

app.get('/api/people/me/activity', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  const page = Math.max(0, Math.floor(Number(c.req.query('page')) || 0))
  const rows = await c.env.DB.prepare(
    `SELECT c.slug, c.title, c.summary, c.type, c.stage, c.media, c.location,
       GROUP_CONCAT(a.kind) kinds, MAX(a.created_at) marked_at
     FROM challenge_actions a JOIN challenges c ON c.id = a.challenge_id
     WHERE a.person_id = ? GROUP BY c.id ORDER BY marked_at DESC, c.id LIMIT 51 OFFSET ?`,
  ).bind(me.id, page * 50).all()
  return c.json({ items: rows.results.slice(0, 50).map((r) => ({ ...r,
    media: json<Media[]>(r.media, []), kinds: String(r.kinds).split(','),
  })), next_page: rows.results.length > 50 ? page + 1 : null })
})

const actionBody = z.object({
  kind: z.enum(ACTION_KINDS),
  active: z.boolean().default(true),
  help_kind: z.enum(HELP_KINDS).optional(),
  note: z.string().max(500).optional(),
})

// Requires a session. The actor is the signed-in person and cannot be spoofed
// by a header - see apps/api/src/auth.ts.
app.post('/api/challenges/:slug/action', async (c) => {
  const parsed = actionBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { kind, active, help_kind, note } = parsed.data

  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  const personId = me.id

  const challenge = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!challenge) return c.json({ error: 'not_found' }, 404)

  await c.env.DB.batch([
    active ? c.env.DB.prepare(
      `INSERT INTO challenge_actions (challenge_id, person_id, kind, help_kind, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (challenge_id, person_id, kind) DO UPDATE SET
         help_kind = excluded.help_kind, note = excluded.note`,
    ).bind(challenge.id, personId, kind, help_kind ?? null, note ?? null)
      : c.env.DB.prepare('DELETE FROM challenge_actions WHERE challenge_id = ? AND person_id = ? AND kind = ?')
        .bind(challenge.id, personId, kind),
    c.env.DB.prepare("UPDATE challenges SET last_activity_at = datetime('now') WHERE id = ?").bind(challenge.id),
  ])

  const counts = await c.env.DB.prepare(
    'SELECT kind, COUNT(*) n FROM challenge_actions WHERE challenge_id = ? GROUP BY kind',
  ).bind(challenge.id).all()
  const seed = await c.env.DB.prepare('SELECT seed_actions FROM challenges WHERE id = ?').bind(challenge.id).first()

  const real: Record<string, number> = {}
  for (const a of ((counts.results ?? []) as Row[])) real[String(a.kind)] = Number(a.n)
  c.header('Cache-Control', 'private, no-store')
  return c.json({ ok: true, active, actions: mergeActions(real, seed?.seed_actions) })
})

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Upload one file. The body IS the file - no multipart, no JSON envelope, so a
 * phone on a weak connection does one request and gets one key back.
 */
app.put('/api/uploads', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  if (!c.env.MEDIA) return c.json({ error: 'media_unavailable' }, 503)

  const declared = c.req.header('content-length')
  const check = checkUpload(c.req.header('content-type'), declared ? Number(declared) : null)
  if (!check.ok) return c.json({ error: check.error, max_bytes: MAX_BYTES }, check.status)
  if (!c.req.raw.body) return c.json({ error: 'empty_body' }, 400)

  const key = mediaKey(me.id, check.ext, mintToken().slice(0, 12))

  /*
   * Buffer once, then store and measure from the same bytes. Streaming the body
   * straight through is cheaper, but the stream is consumed by the put and the
   * dimensions are only readable from the header - and a second read of an R2
   * object to recover them costs more than holding a file we already cap at
   * 100MB.
   */
  const bytes = new Uint8Array(await c.req.raw.arrayBuffer())
  if (bytes.byteLength === 0) return c.json({ error: 'empty_body' }, 400)

  // A client can lie in content-length, so the cap is enforced on what actually
  // arrived, before anything is written.
  if (bytes.byteLength > MAX_BYTES) return c.json({ error: 'too_large', max_bytes: MAX_BYTES }, 413)

  const stored = await c.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: c.req.header('content-type')!.split(';')[0].trim() },
    customMetadata: { person_id: me.id },
  })

  // A format this cannot parse (video, HEIC) returns null and the surfaces fall
  // back to their own shape, which is why w/h are optional on Media.
  const size = dimensionsOf(bytes)

  return c.json({
    ok: true,
    media: { kind: check.kind, url: mediaUrl(key), key, ...(size ?? {}) },
    bytes: stored?.size ?? bytes.byteLength,
  })
})

/**
 * Serves an uploaded object. Immutable: keys carry a random component and are
 * never reused, so a long cache is safe.
 */
app.get('/media/*', async (c) => {
  if (!c.env.MEDIA) return c.notFound()
  const key = new URL(c.req.url).pathname.replace(/^\/media\//, '')
  if (!key) return c.notFound()

  const object = await c.env.MEDIA.get(key)
  if (!object) return c.notFound()

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(object.body, { headers })
})

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

const emailBody = z.object({
  email: z.string().email().max(254),
  /** Where to land after the link is clicked. Same-origin paths only. */
  next: z.string().max(300).optional(),
})

/**
 * Only ever redirect to a path on this site. An open redirect in a link we
 * email out is a phishing primitive: the mail is genuinely from us, and the
 * destination is not.
 */
const safeNext = (raw: string | undefined) =>
  raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null

/**
 * How many sign-in links one address, and one IP, may ask for per hour.
 *
 * Per-email stops someone mailbombing a person they dislike with real mail from
 * a real domain - the reputational damage lands on us, not them. Per-IP is the
 * wider net: a script walking an address list gets 20 attempts, not unlimited.
 * The IP ceiling is the looser of the two on purpose, because a household, an
 * office or a carrier NAT is one address to us and several people to itself.
 */
const LINKS_PER_EMAIL_HOUR = 5
const LINKS_PER_IP_HOUR = 20

/**
 * Counted in D1, not in the Workers rate-limiting binding.
 *
 * The binding cannot express an hour: its `period` is an enum of 10 or 60
 * SECONDS (node_modules/wrangler/config-schema.json), so the shortest limit it
 * can state is per-minute, which stops nothing an attacker paces. KV is out for
 * a different reason - one write per second per key, and a counter is one key.
 *
 * magic_links already stores the email and the timestamp of every request, so
 * the count is a query against a table we were writing anyway. The cost is two
 * indexed COUNT(*)s on the sign-in path, which is not a hot path.
 */
export const overRateLimit = async (
  db: D1Database,
  email: string,
  ip: string | null,
): Promise<boolean> => {
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM magic_links
         WHERE email = ? AND created_at > datetime('now', '-1 hour')) AS by_email,
       (SELECT COUNT(*) FROM magic_links
         WHERE ip IS NOT NULL AND ip = ? AND created_at > datetime('now', '-1 hour')) AS by_ip`,
  ).bind(email, ip).first<{ by_email: number; by_ip: number }>()
  if (!row) return false
  if (Number(row.by_email) >= LINKS_PER_EMAIL_HOUR) return true
  // A missing IP cannot be rate limited by IP - `ip = NULL` is never true in
  // SQL, so the subquery returns 0 and only the per-email limit applies.
  if (ip !== null && Number(row.by_ip) >= LINKS_PER_IP_HOUR) return true
  return false
}

/**
 * Sends a magic link. Always answers the same way whether or not the address is
 * known - the response must not reveal who has an account here.
 */
app.post('/api/auth/request', async (c) => {
  const parsed = emailBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_email' }, 400)
  const email = normalizeEmail(parsed.data.email)
  const ip = c.req.header('cf-connecting-ip') ?? null

  const over = await overRateLimit(c.env.DB, email, ip)
  if (over) {
    // 429 with no detail about which limit tripped. Saying "too many for this
    // address" confirms the address was tried, which is the same disclosure the
    // uniform success response at the bottom of this handler exists to prevent.
    return c.json({ error: 'too_many_requests' }, 429)
  }

  // One live link per address at a time: requesting a second invalidates the
  // first, so a forwarded old email cannot be used to take the account.
  const token = mintToken()
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE email = ? AND used_at IS NULL").bind(email),
    c.env.DB.prepare('INSERT INTO magic_links (token_hash, email, expires_at, ip) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(token), email, linkExpiry(), ip),
  ])

  const next = safeNext(parsed.data.next)
  const link = `${new URL(c.req.url).origin}/api/auth/callback?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`
  const sent = await sendMagicLink(c.env, email, link)

  // In dev there is no mail key, so the link goes to the Worker log. Never in prod.
  if (!sent) console.log(`[auth] magic link for ${email}: ${link}`)

  // The link is a bearer token for the account. Returning it in the response
  // body is a convenience for local dev ONLY - anywhere it is reachable by a
  // stranger, POSTing someone else's address would hand over their login. Prod
  // fails closed: if the mail key is missing there, sign-in breaks loudly
  // rather than quietly becoming an open door.
  const showLink = !sent && c.env.ENVIRONMENT !== 'prod'
  return c.json({ ok: true, sent, ...(showLink ? { dev_link: link } : {}) })
})

/**
 * The sign-in mail as HTML. Table-free, inline styles only: Gmail strips
 * <style> blocks, so anything in a stylesheet is decoration the reader may
 * never see. The raw URL follows the button because a link that renders as a
 * button in one client renders as nothing in another.
 */
const signInEmailHtml = (link: string) => {
  // The link goes into an href and into text; both need escaping or a & in
  // the query string ends the attribute.
  const safe = link.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
    <div style="max-width:480px;margin:0 auto">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b">Techno Optimists</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.2">Your sign-in link</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">Click to sign in. The link works once and expires in 15 minutes.</p>
      <p style="margin:0 0 24px">
        <a href="${safe}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#faf9f7;text-decoration:none;font-size:15px">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b6b6b">Or paste this into your browser:</p>
      <p style="margin:0;font-size:13px;word-break:break-all"><a href="${safe}" style="color:#1a1a1a">${safe}</a></p>
    </div>
  </body>
</html>`
}

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
      // Both parts: `html` gives a real clickable link, `text` is the fallback
      // for clients that refuse HTML. Resend sends whichever the client takes.
      html: signInEmailHtml(link),
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

  // Look the row up by hash alone, then say which of the three things went
  // wrong. Folding them into one WHERE returns "expired" for a link that was
  // superseded a minute ago, or for one whose row is simply gone - a reader
  // who just asked for it reads that as the product lying to them.
  const hash = await hashToken(token)
  const link = await c.env.DB.prepare(
    'SELECT email, used_at, expires_at FROM magic_links WHERE token_hash = ?',
  ).bind(hash).first<{ email: string; used_at: string | null; expires_at: string }>()

  if (!link) return c.redirect('/signin?error=unknown', 302)
  if (link.used_at) return c.redirect('/signin?error=used', 302)

  const stillValid = await c.env.DB.prepare(
    "SELECT 1 ok FROM magic_links WHERE token_hash = ? AND expires_at > datetime('now')",
  ).bind(hash).first()
  if (!stillValid) return c.redirect('/signin?error=expired', 302)

  // Claim the link here, not in the batch at the end of the handler. The reads
  // above are diagnostic - they exist to tell the reader which of the three
  // things went wrong - and between them and the old UPDATE sat uniqueHandle()
  // and a person INSERT, so two clicks a few hundred ms apart both passed the
  // used_at check and both got a session. `WHERE used_at IS NULL` makes the
  // claim the same statement as the test: exactly one caller sees changes = 1,
  // and the loser is told the link is used rather than handed a second session.
  const claim = await c.env.DB.prepare(
    "UPDATE magic_links SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL",
  ).bind(hash).run()
  if (claim.meta.changes !== 1) return c.redirect('/signin?error=used', 302)

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
      c.env.DB.prepare('INSERT INTO identities (person_id, email, is_admin) VALUES (?, ?, ?)')
        .bind(id, email, isAdminEmail(c.env, email) ? 1 : 0),
    ])
    person = { id }
    notify(c, 'person_created', { handle, email })
  }

  const session = mintToken()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO sessions (token_hash, person_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(session), person.id, sessionExpiry(), c.req.header('user-agent') ?? null),
    c.env.DB.prepare("UPDATE identities SET last_login_at = datetime('now') WHERE email = ?").bind(email),
  ])

  const secure = new URL(c.req.url).protocol === 'https:'
  c.header('set-cookie', cookie(session, secure))
  // Two cookies, so `append` - c.header() replaces by default, and without it
  // the session cookie set on the line above would be dropped and sign-in
  // would silently do nothing.
  //
  // The redirect target is the reader's own `next` path, which may already
  // carry a query string, so the "you're signed in" note travels as a cookie
  // rather than as a param appended to it.
  c.header('set-cookie', signalCookie('signed_in', secure), { append: true })
  return c.redirect(safeNext(new URL(c.req.url).searchParams.get('next') ?? undefined) ?? '/', 302)
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

/**
 * The reader's own account, and the ONLY response on the site that carries an
 * email address. It goes to the person it belongs to and to nobody else: the
 * lookup is by session cookie, so there is no parameter an attacker could aim
 * at someone else's row.
 *
 * Everything else about a person is served by /api/people/:handle, which
 * returns PublicPerson and structurally cannot carry an address or a real name.
 */
app.get('/api/auth/me', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ person: null })

  const row = await c.env.DB.prepare(
    `SELECT p.skills, i.email
     FROM people p LEFT JOIN identities i ON i.person_id = p.id
     WHERE p.id = ?`,
  ).bind(me.id).first()

  return c.json({
    person: {
      ...me,
      skills: json<string[]>(row?.skills, []),
      // LEFT JOIN: a seeded person has no identity row and so no address. Null
      // is the right answer there, not a crash and not an empty string.
      email: row?.email == null ? null : String(row.email),
    },
  })
})

const profileBody = z.object({
  handle: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(120).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  roles: z.array(z.enum(ROLES)).max(ROLES.length).optional(),
})

/** What the form is told when a handle is refused. One sentence per rule. */
const HANDLE_ERROR: Record<string, string> = {
  too_short: `A handle needs at least ${HANDLE_MIN} characters.`,
  too_long: `A handle can be at most ${HANDLE_MAX} characters.`,
  bad_chars: 'Letters, numbers and underscores only.',
  all_digits: 'A handle needs at least one letter.',
  reserved: 'That handle is reserved.',
  taken: 'That handle is taken.',
}

/**
 * Changes the reader's own profile. There is no id in the path on purpose:
 * the row edited is always the session's own, so no amount of guessing reaches
 * anyone else's account.
 *
 * Email is deliberately NOT editable here. The address is what the magic link
 * proves ownership of, so changing it is a change of identity and has to go
 * back through the mailbox - a PATCH that rewrote it would let anyone holding a
 * borrowed session move an account to their own address and keep it.
 */
app.patch('/api/people/me', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)

  const parsed = profileBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const { handle, name, location, skills, roles } = parsed.data

  const sets: string[] = []
  const values: unknown[] = []

  if (handle !== undefined) {
    // Lowercase first: someone typing their own handle back with a capital
    // means the same handle, and refusing it reads as the product being broken.
    const wanted = normalizeHandle(handle)
    if (wanted !== me.handle) {
      const problem = handleProblem(wanted)
      if (problem) return c.json({ error: 'bad_handle', reason: problem, message: HANDLE_ERROR[problem] }, 400)

      const taken = await c.env.DB.prepare('SELECT 1 FROM people WHERE handle = ? AND id != ?')
        .bind(wanted, me.id).first()
      if (taken) return c.json({ error: 'bad_handle', reason: 'taken', message: HANDLE_ERROR.taken }, 409)

      sets.push('handle = ?')
      values.push(wanted)
    }
  }

  if (name !== undefined) { sets.push('name = ?'); values.push(name) }
  // An empty string is how the form says "clear this", and a location of "" in
  // the database would render as a blank line rather than as absent.
  if (location !== undefined) { sets.push('location = ?'); values.push(location || null) }
  if (skills !== undefined) { sets.push('skills = ?'); values.push(JSON.stringify([...new Set(skills)])) }
  if (roles !== undefined) { sets.push('roles = ?'); values.push(JSON.stringify([...new Set(roles)])) }

  if (sets.length > 0) {
    values.push(me.id)
    try {
      await c.env.DB.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()
    } catch (err) {
      // The UNIQUE index is the real arbiter: the SELECT above can pass and
      // still lose a race to another signup taking the same handle a
      // millisecond later. Answer that as the conflict it is, not as a 500.
      const message = err instanceof Error ? err.message : String(err)
      if (/UNIQUE|constraint/i.test(message)) {
        return c.json({ error: 'bad_handle', reason: 'taken', message: HANDLE_ERROR.taken }, 409)
      }
      throw err
    }
  }

  const fresh = await currentPerson(c)
  return c.json({ ok: true, person: fresh })
})

/**
 * Somebody else's profile. Returns PublicPerson: no name, no email, no admin
 * flag - see packages/types/index.ts for why each of those is absent.
 */
// Public authored contributions only. Never includes follows, sessions or contact fields.
app.get('/api/people/:handle/contributions', async (c) => {
  const handle = normalizeHandle(c.req.param('handle'))
  const person = await c.env.DB.prepare('SELECT id, handle FROM people WHERE handle = ?').bind(handle).first<{id: string; handle: string}>()
  if (!person) return c.json({ error: 'not_found' }, 404)
  const offset = Math.min(100000, Math.max(0, Number(c.req.query('offset')) || 0))
  const rows = await c.env.DB.prepare(`
    SELECT * FROM (
      SELECT 'challenge' kind, ch.id, ch.slug, ch.title, ch.summary body, COALESCE(ch.imported_at, ch.created_at) created_at
      FROM challenges ch WHERE ch.author_id = ?
      UNION ALL
      SELECT 'comment' kind, cm.id, ch.slug, ch.title, cm.body, cm.created_at
      FROM challenge_comments cm JOIN challenges ch ON ch.id = cm.challenge_id WHERE cm.author_id = ?
      UNION ALL
      SELECT 'update' kind, u.id, ch.slug, ch.title, u.body, u.created_at
      FROM updates u JOIN challenges ch ON ch.id = u.challenge_id WHERE u.author_id = ?
    ) ORDER BY created_at DESC, id DESC LIMIT 31 OFFSET ?
  `).bind(person.id, person.id, person.id, Math.floor(offset)).all()
  return c.json({ person: { handle: person.handle }, contributions: rows.results.slice(0, 30), next_offset: rows.results.length > 30 ? Math.floor(offset) + 30 : null })
})

app.get('/api/people/:handle', async (c) => {
  const handle = normalizeHandle(c.req.param('handle'))
  const row = await c.env.DB.prepare(
    `SELECT p.id, p.handle, p.avatar_url, p.location, p.skills, p.roles, p.created_at,
            (SELECT COUNT(*) FROM challenges ch WHERE ch.author_id = p.id) challenges_count
     FROM people p WHERE p.handle = ?`,
  ).bind(handle).first()
  if (!row) return c.json({ error: 'not_found' }, 404)

  return c.json({
    person: {
      id: String(row.id),
      handle: String(row.handle),
      avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
      location: row.location == null ? null : String(row.location),
      skills: json<string[]>(row.skills, []),
      roles: json<string[]>(row.roles, []),
      challenges_count: Number(row.challenges_count ?? 0),
      created_at: String(row.created_at),
    },
  })
})

/**
 * Signs out. `{"everywhere":true}` revokes every session for the account, not
 * just this browser - the only move available to someone who thinks a device
 * was taken, and there is no other way to reach a 60-day cookie sitting on a
 * phone they no longer hold.
 */
app.post('/api/auth/signout', async (c) => {
  const token = readCookie(c.req.header('cookie'), SESSION_COOKIE)
  const everywhere = (await c.req.json().catch(() => null))?.everywhere === true
  if (token) {
    const hash = await hashToken(token)
    if (everywhere) {
      // Resolve the person from this session, then drop all of theirs. Scoped
      // by person_id, so a stolen cookie can only revoke its own account.
      const row = await c.env.DB.prepare('SELECT person_id FROM sessions WHERE token_hash = ?')
        .bind(hash).first<{ person_id: string }>()
      if (row) {
        await c.env.DB.prepare('DELETE FROM sessions WHERE person_id = ?').bind(row.person_id).run()
      }
    } else {
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()
    }
  }
  const secure = new URL(c.req.url).protocol === 'https:'
  c.header('set-cookie', clearCookie(secure))
  // SessionNav reloads the page right after this returns, so the confirmation
  // has to survive that reload - see signalCookie in auth.ts.
  c.header('set-cookie', signalCookie('signed_out', secure), { append: true })
  return c.json({ ok: true })
})

app.get('/api/scout/sources', async (c) => {
  const days = Number(c.req.query('days') ?? 30)
  if (![7, 30, 90].includes(days)) return c.json({ error: 'days_must_be_7_30_or_90' }, 400)
  const history = c.env.CACHE ? await recentSourceRuns(c.env.CACHE, days) : { runs: [], truncated: false }
  return c.json({ window_days: days, truncated: history.truncated, sources: summarizeSources(SCOUT_FEEDS, history.runs),
    policy: { max_articles_per_run: 2, runs_per_day: 4, exploration_fraction: 0.25, minimum_evaluated: 20, minimum_runs: 5, automatic_retirement: false } }, 200, { 'Cache-Control': 'public, max-age=60' })
})
app.get('/api/scout/source-runs', async (c) => {
  const page = c.env.CACHE ? await sourceRunPage(c.env.CACHE, c.req.query('cursor')) : { runs: [], next_cursor: null }
  return c.json(page, 200, { 'Cache-Control': 'public, max-age=60' })
})

app.get('/api/scout/status', async (c) => {
  const last = await c.env.CACHE?.get('scout:last-run', 'json')
  return c.json({ enabled: c.env.SCOUT_ENABLED === 'true', schedule: SCOUT_CRON, timezone: 'UTC', last_run: last ?? null }, 200, { 'Cache-Control': 'no-store' })
})

app.get('/api/health', async (c) => {
  const r = await c.env.DB.prepare('SELECT COUNT(*) n FROM challenges').first<{ n: number }>()
  return c.json({ ok: true, challenges: r?.n ?? 0 })
})

/* -------------------------------------------------------------------------- */
/* Site-wide hit counter                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The reader's key for the site counter: IP + User-Agent + a fixed salt,
 * hashed and truncated. Same construction as the per-Challenge one in
 * community.ts, with a constant where that one uses the Challenge id - here
 * the whole site is the thing being counted, so there is nothing to vary.
 *
 * The salt means the two tables cannot be joined to follow a reader from the
 * site counter onto a particular Challenge: the same person hashes to
 * different keys in each.
 */
const siteViewerKey = async (c: { req: { header(name: string): string | undefined } }) => {
  const raw = [
    c.req.header('cf-connecting-ip') ?? '',
    c.req.header('user-agent') ?? '',
    'technooptimists-site-counter',
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Records that someone loaded the site, and answers with the running total.
 *
 * A POST from the page for the same reason the Challenge counter is one: most
 * pages are prerendered static assets, so the Worker never sees the read and
 * counting server-side would miss exactly the popular pages.
 *
 * Mounted here rather than on the `community` router because that router
 * rejects a non-GET without an `application/json` content-type (415). A
 * counter ping carries no body, and a page unloading mid-visit should be able
 * to send it as a beacon, which sets its own content-type.
 */
app.post('/api/site/view', async (c) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'bad_origin' }, 403)

  const viewedOn = new Date().toISOString().slice(0, 10)
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO site_views (viewer_key, viewed_on) VALUES (?, ?)',
  ).bind(await siteViewerKey(c), viewedOn).run()

  track(c.env, 'site_view', new URL(c.req.url).pathname, {
    country: c.req.header('cf-ipcountry') ?? '',
    referrer: c.req.header('referer') ?? '',
  })

  const total = await c.env.DB.prepare('SELECT COUNT(*) n FROM site_views').first<{ n: number }>()
  return c.json({ views: Number(total?.n ?? 0) })
})

/**
 * The total on its own, for a page that wants to show the number without
 * adding to it - and for the build, which bakes a starting value into the
 * HTML so the counter is never visibly empty before its script runs.
 */
app.get('/api/site/views', async (c) => {
  const total = await c.env.DB.prepare('SELECT COUNT(*) n FROM site_views').first<{ n: number }>()
  return c.json({ views: Number(total?.n ?? 0) })
})

/* -------------------------------------------------------------------------- */
/* Challenge pages created after the last build                               */
/* -------------------------------------------------------------------------- */

/**
 * Astro prerenders a page per Challenge at build time, which is right for the
 * seeded corpus and wrong for anything a user posts afterwards: their new
 * Challenge has no HTML file and the assets binding answers 404.
 *
 * So: try the prerendered page first, and when it is missing, serve the newest
 * built Challenge page as a shell and let it fetch this slug from the API on
 * load. The reader gets their Challenge immediately; the next build turns it
 * into a static page like any other.
 */
app.on('GET', ['/c/:slug', '/v1/c/:slug'], async (c) => {
  if (!c.env.ASSETS) return c.notFound()
  if (c.req.param('slug') === '_shell') return c.notFound()

  const prerendered = await c.env.ASSETS.fetch(new Request(c.req.url, { headers: c.req.raw.headers }))
  if (prerendered.status === 200) return prerendered

  const slug = c.req.param('slug')
  const exists = await c.env.DB.prepare('SELECT 1 FROM challenges WHERE slug = ?').bind(slug).first()
  const classic = c.req.path.startsWith('/v1/')
  if (!exists) {
    if (classic) return prerendered
    const missingUrl = new URL(c.req.url); missingUrl.pathname = '/404'
    const missing = await c.env.ASSETS.fetch(new Request(missingUrl, { headers: c.req.raw.headers }))
    return new Response(missing.body, { status: 404, headers: missing.headers })
  }

  // Always built, even for an empty corpus. Never borrow another Challenge's
  // content or inject a script that the page's CSP would reject.
  const shellUrl = new URL(c.req.url)
  shellUrl.pathname = classic ? '/v1/c/_shell' : '/c/_shell'
  const shell = await c.env.ASSETS.fetch(new Request(shellUrl.toString(), { headers: c.req.raw.headers }))
  if (shell.status !== 200) return prerendered

  return new Response(shell.body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
})

/**
 * Proves the error boundary is live on a deployment, and nothing else.
 *
 * The boundary is the one piece of error handling that cannot be checked by
 * looking at a healthy response - every route working is exactly what it looks
 * like when the boundary is missing. So there is a route whose only job is to
 * throw. `verify.mjs` calls it and asserts the answer carries a ray.
 *
 * Never in prod: a public endpoint that reliably 500s is a free way to fill
 * someone's logs. It 404s there, like any other unknown path.
 *
 * Registered ABOVE the catch-all below, because Hono answers with the first
 * route that matches. Declared after it, this returned {"error":"not_found"}
 * and the deploy looked fine while the boundary went unexercised.
 */
app.get('/api/_throw', (c) => {
  if (c.env.ENVIRONMENT === 'prod') return c.json({ error: 'not_found' }, 404)
  throw new Error('deliberate: verifying the error boundary')
})

/*
 * The newspaper used to live under /v2 and a script on every page redirected
 * there, so every address anyone typed or pasted grew a prefix on arrival. It
 * is served at the bare paths now. These 301s keep the old links working -
 * bookmarks, anything already indexed, a URL in someone's message - and hand
 * back the clean address permanently rather than serving both forever.
 */
app.get('/v2/*', (c) => {
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/v2(?=\/|$)/, '') || '/'
  return c.redirect(url.toString(), 301)
})
app.get('/v2', (c) => {
  const url = new URL(c.req.url); url.pathname = '/'
  return c.redirect(url.toString(), 301)
})

// Unknown Classic URLs keep the Classic 404 rather than falling through to the
// newspaper's, so a reader browsing /v1 is not silently moved between designs.
app.get('/v1/*', async (c) => {
  if (!c.env.ASSETS) return c.notFound()
  const response = await c.env.ASSETS.fetch(c.req.raw)
  if (response.status !== 404) return response
  const url = new URL(c.req.url); url.pathname = '/v1/404'
  const missing = await c.env.ASSETS.fetch(new Request(url, { headers: c.req.raw.headers }))
  return new Response(missing.body, { status: 404, headers: missing.headers })
})

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

/**
 * The headers every response carries, applied in one place for the same reason
 * track() is: this is the only point every response passes through, so there is
 * no route that can be added later and quietly miss them.
 *
 * What each one stops:
 *  - frame-ancestors 'none' - clickjacking. A CSP in a <meta> tag CANNOT carry
 *    this directive (browsers ignore it there), which is why the page CSP that
 *    Astro generates is not enough on its own and this exists.
 *  - HSTS - the downgrade attack on the first http:// hop. preload is included
 *    deliberately: the apex and www both serve https and nothing else does.
 *  - nosniff - a user-uploaded file being re-interpreted as script. R2 media is
 *    served from this same origin, so this is the one that matters most here.
 *  - Referrer-Policy - a Challenge URL leaking to whatever a reader clicks to.
 *  - Permissions-Policy - denies hardware this site never asks for.
 *
 * The API sends its own CSP because Astro's <meta> tag only exists on HTML
 * pages; a JSON response rendered directly in a browser tab has none otherwise.
 */
const secured = (res: Response, req: Request): Response => {
  const out = new Response(res.body, res)
  const url = new URL(req.url)
  out.headers.set('X-Content-Type-Options', 'nosniff')
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  // Only over https - sent on a plain http response it is ignored by spec, and
  // on local dev it would pin 127.0.0.1 to https in the browser for a year.
  if (url.protocol === 'https:') {
    out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  // Pages: Astro's <meta> CSP already carries the script/style hashes, so the
  // header here adds only what a meta tag cannot express, and must NOT restate
  // script-src - two policies both apply, and the strictest of each directive
  // wins, so a 'self' here would override Astro's hashes and break hydration.
  // API: nothing renders, so everything is denied.
  out.headers.set(
    'Content-Security-Policy',
    url.pathname.startsWith('/api/')
      ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      : "frame-ancestors 'none'",
  )
  return out
}

export { app, secured }
export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScout(env, controller.scheduledTime))
  },
  /**
   * One call site for traffic, rather than a track() in every route: this is
   * the only place every request passes through, and it is the only place that
   * knows the final status and how long the whole thing took.
   *
   * waitUntil, not await - the response goes back first and the write happens
   * after. A blocked or slow dataset costs nothing on the request path.
   */
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const started = Date.now()
    const res = await secured(await app.fetch(req, env, ctx), req)
    try {
      const url = new URL(req.url)
      // Assets and the API both come through here. Recording every hashed
      // /_astro/ file would bury the pages in build artefacts, so they are
      // dropped - the question this data answers is which pages people open.
      if (!url.pathname.startsWith('/_astro/')) {
        ctx.waitUntil(Promise.resolve().then(() => track(
          env,
          url.pathname.startsWith('/api/') ? 'api' : 'pageview',
          url.pathname,
          {
            country: req.headers.get('cf-ipcountry') ?? '',
            referrer: req.headers.get('referer') ?? '',
            ms: Date.now() - started,
            status: res.status,
          },
        )))
      }
    } catch { /* never let telemetry touch the response */ }
    return res
  },
}
