import { d1, emit, fillSeries, curStart, prevStart, end } from './_cf.mjs'

const BY_SCOUT = `FROM challenges WHERE author_id = (SELECT id FROM people WHERE handle = 'atlas')
  AND imported_at >= ?1 AND imported_at < ?2`

const [[cur], [prev], daily, types, threads] = await Promise.all([
  d1(`SELECT COUNT(*) AS n ${BY_SCOUT}`, [curStart, end]),
  d1(`SELECT COUNT(*) AS n ${BY_SCOUT}`, [prevStart, curStart]),
  d1(`SELECT substr(imported_at, 1, 10) AS d, COUNT(*) AS n ${BY_SCOUT} GROUP BY d`, [curStart, end]),
  d1(`SELECT type, COUNT(*) AS n ${BY_SCOUT} GROUP BY type ORDER BY n DESC`, [curStart, end]),
  d1(`SELECT title, slug, type, location, imported_at ${BY_SCOUT} ORDER BY imported_at DESC LIMIT 20`, [curStart, end]),
])

emit({
  value: Number(cur.n),
  previous: Number(prev.n),
  series: fillSeries(daily),
  rows: types.map((t) => [t.type, Number(t.n)]),
  threads,
})
