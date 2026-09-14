import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { track } from './analytics'
import { currentPerson, mintToken } from './auth'
import { notify } from './slack'
import { COMMENT_KINDS, type ChallengeComment } from '../../../packages/types/index'

// A single grapheme accepts flags, skin tones and joined emoji, but not a string
// of decorations or arbitrary text. Empty is the admin's explicit remove action.
export const emojiValue = z.string().trim().max(32).refine((value) =>
  value === '' || (
    [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length === 1
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value)
  ), 'Use one emoji, or leave it empty.').nullable()

const editorialBody = z.object({
  emoji: emojiValue.optional(),
  title: z.string().trim().min(8).max(180).optional(),
  summary: z.string().trim().min(10).max(500).optional(),
  body: z.string().trim().max(20000).nullable().optional(),
}).strict().refine((v) => Object.keys(v).length > 0)

const commentBody = z.object({
  body: z.string().trim().min(1).max(5000).refine((body) => (body.match(/!\[/g) ?? []).length <= 4, 'Up to 4 attachments per response.'),
  kind: z.enum(COMMENT_KINDS).default('comment'),
  parent_id: z.string().min(1).max(64).nullable().default(null),
  // A retry after an interrupted response must not publish the same text twice.
  request_id: z.string().uuid(),
}).strict()

export const community = new Hono<{ Bindings: { DB: D1Database } }>()
community.use('*', bodyLimit({ maxSize: 128_000, onError: (c) => c.json({ error: 'body_too_large' }, 413) }))
community.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'bad_origin' }, 403)
    if (!c.req.header('content-type')?.includes('application/json')) return c.json({ error: 'json_required' }, 415)
  }
  await next()
})

community.patch('/:slug/editorial', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  if (!me.is_admin) return c.json({ error: 'admin_only' }, 403)
  const parsed = editorialBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body', detail: parsed.error.issues }, 400)
  const row = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const fields = Object.entries(parsed.data)
  await c.env.DB.prepare(`UPDATE challenges SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`)
    .bind(...fields.map(([, value]) => value || null), row.id).run()
  return c.json({ ok: true })
})

const toComment = (row: Record<string, unknown>): ChallengeComment => ({
  id: String(row.id), challenge_id: String(row.challenge_id),
  parent_id: row.parent_id == null ? null : String(row.parent_id),
  kind: row.kind as ChallengeComment['kind'], body: String(row.body),
  author: { id: String(row.author_id), handle: String(row.author_handle),
    avatar_url: row.author_avatar == null ? null : String(row.author_avatar) },
  created_at: String(row.created_at),
  assisted: row.assisted_model == null ? null : { model: String(row.assisted_model) },
})

community.get('/:slug/comments', async (c) => {
  const row = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const before = c.req.query('before')
  if (before && !/^\d+$/.test(before)) return c.json({ error: 'bad_cursor' }, 400)
  // Newest page first, displayed chronologically. Rowid makes same-second
  // ordering stable and lets older pages load without skipping replies.
  // The left join is what puts the "drafted with AI" mark on a response. It
  // stays a join rather than a column on the comment so the original model
  // text and the published text can never drift apart.
  const rows = await c.env.DB.prepare(`SELECT m.*, m.rowid cursor, p.handle author_handle, p.avatar_url author_avatar,
      r.model assisted_model
    FROM challenge_comments m JOIN people p ON p.id = m.author_id
    LEFT JOIN ai_runs r ON r.published_comment_id = m.id
    WHERE m.challenge_id = ? ${before ? 'AND m.rowid < ?' : ''}
    ORDER BY m.rowid DESC LIMIT 51`).bind(row.id, ...(before ? [Number(before)] : [])).all()
  const page = rows.results.slice(0, 50)
  return c.json({ comments: page.reverse().map(toComment),
    next_cursor: rows.results.length > 50 ? String(page[0].cursor) : null })
})

/**
 * Records that someone opened this Challenge.
 *
 * A POST from the page rather than a count inside the `/c/:slug` handler,
 * because that handler mostly does not run: the top Challenges are prerendered
 * by `getStaticPaths`, so the asset handler answers them and the Worker never
 * sees the read. Counting there would have counted every Challenge except the
 * popular ones.
 *
 * Anonymous by design - most readers are signed out, and a view that only
 * counts members is not the number Roy asked for. No body, no auth, and the
 * response carries the new count so the page can render it without a refetch.
 */
community.post('/:slug/view', async (c) => {
  const row = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!row) return c.json({ error: 'not_found' }, 404)

  // IP and User-Agent identify a reload; the Challenge id salts them so the
  // same reader hashes differently on every Challenge. SHA-256 of that, stored
  // truncated - enough to collide rarely, not enough to reverse to an address.
  const raw = [
    c.req.header('cf-connecting-ip') ?? '',
    c.req.header('user-agent') ?? '',
    String(row.id),
  ].join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const viewerKey = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  // Day granularity: the same person opening it tomorrow is a real second view,
  // opening it twice in one afternoon is not.
  const viewedOn = new Date().toISOString().slice(0, 10)

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO challenge_views (challenge_id, viewer_key, viewed_on) VALUES (?, ?, ?)',
  ).bind(row.id, viewerKey, viewedOn).run()

  // The counter above is the deduplicated number a card shows. This is the raw
  // event stream, one row per open with no dedupe, in the dataset that already
  // records traffic - so "how did views build up over the week" stays answerable
  // even though the table only ever holds a total.
  track(c.env as { ANALYTICS?: AnalyticsEngineDataset }, 'challenge_view', `/c/${c.req.param('slug')}`, {
    country: c.req.header('cf-ipcountry') ?? '',
    referrer: c.req.header('referer') ?? '',
  })

  const total = await c.env.DB.prepare('SELECT COUNT(*) n FROM challenge_views WHERE challenge_id = ?')
    .bind(row.id).first<{ n: number }>()
  return c.json({ ok: true, views_count: Number(total?.n ?? 0) })
})

community.post('/:slug/comments', async (c) => {
  const me = await currentPerson(c)
  if (!me) return c.json({ error: 'sign_in_required' }, 401)
  const parsed = commentBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad_body' }, 400)
  const row = await c.env.DB.prepare('SELECT id FROM challenges WHERE slug = ?').bind(c.req.param('slug')).first()
  if (!row) return c.json({ error: 'not_found' }, 404)
  const { body, kind, parent_id, request_id } = parsed.data
  const previous = await c.env.DB.prepare('SELECT id FROM challenge_comments WHERE author_id = ? AND request_id = ?')
    .bind(me.id, request_id).first()
  if (previous) return c.json({ ok: true, id: previous.id }, 200)
  if (parent_id) {
    const parent = await c.env.DB.prepare('SELECT id FROM challenge_comments WHERE id = ? AND challenge_id = ?')
      .bind(parent_id, row.id).first()
    if (!parent) return c.json({ error: 'reply_not_found' }, 400)
  }
  const recent = await c.env.DB.prepare("SELECT COUNT(*) n FROM challenge_comments WHERE author_id = ? AND created_at > datetime('now', '-1 minute')")
    .bind(me.id).first<{ n: number }>()
  if (recent && recent.n >= 5) return c.json({ error: 'slow_down' }, 429)
  const id = `cm_${mintToken().slice(0, 16)}`
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO challenge_comments (id, challenge_id, author_id, parent_id, kind, body, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, row.id, me.id, parent_id, kind, body, request_id),
    c.env.DB.prepare("UPDATE challenges SET last_activity_at = datetime('now') WHERE id = ?").bind(row.id),
    ...(kind === 'idea' ? [c.env.DB.prepare("INSERT OR IGNORE INTO challenge_actions (challenge_id, person_id, kind) VALUES (?, ?, 'have_idea')").bind(row.id, me.id)] : []),
  ])
  notify(c, 'comment_posted', {
    slug: c.req.param('slug'),
    kind,
    author: me.handle ?? me.id,
    // Slack renders the preview as a blockquote, so a newline would break out
    // of it and the rest of the comment would read as a separate line.
    preview: body.replace(/\s+/g, ' ').slice(0, 160),
  })
  return c.json({ ok: true, id }, 201)
})
