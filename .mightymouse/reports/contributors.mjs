import { d1, emit, fillSeries, notTestEmail, curStart, prevStart, end } from './_cf.mjs'

// Outside = a real email identity that is not an admin; Scout's @atlas has no identity.
const CONTRIBUTIONS = `
  WITH outside AS (SELECT person_id FROM identities WHERE is_admin = 0 AND ${notTestEmail('email')}),
  c AS (
    SELECT author_id AS pid, created_at, 'thread' AS kind FROM challenges WHERE imported_at IS NULL
    UNION ALL SELECT person_id, created_at, 'action' FROM challenge_actions
    UNION ALL SELECT author_id, created_at, 'comment' FROM challenge_comments
    UNION ALL SELECT author_id, created_at, 'update' FROM updates
  )
  SELECT c.* FROM c JOIN outside o ON o.person_id = c.pid
  WHERE c.created_at >= ?1 AND c.created_at < ?2`

const [cur, prev] = await Promise.all([
  d1(CONTRIBUTIONS, [curStart, end]),
  d1(CONTRIBUTIONS, [prevStart, curStart]),
])

const distinct = (rows) => new Set(rows.map((r) => r.pid)).size
const perDay = new Map()
for (const r of cur) {
  const d = r.created_at.slice(0, 10)
  if (!perDay.has(d)) perDay.set(d, new Set())
  perDay.get(d).add(r.pid)
}
const byKind = ['thread', 'action', 'comment', 'update'].map((k) => [k === 'action' ? 'typed actions' : `${k}s`, cur.filter((r) => r.kind === k).length])

emit({
  value: distinct(cur),
  previous: distinct(prev),
  series: fillSeries([...perDay].map(([d, s]) => ({ d, n: s.size }))),
  rows: byKind,
})
