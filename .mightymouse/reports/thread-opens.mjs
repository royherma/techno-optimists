import { d1, emit, windowDays, curStart, prevStart, end } from './_cf.mjs'

// challenge_views is one row per thread per visitor per day, site_views one per visitor per day.
const OPENS = 'SELECT viewed_on AS d, COUNT(*) AS n FROM challenge_views WHERE viewed_on >= ?1 AND viewed_on < ?2 GROUP BY d'
const VISITS = 'SELECT viewed_on AS d, COUNT(*) AS n FROM site_views WHERE viewed_on >= ?1 AND viewed_on < ?2 GROUP BY d'

const [opens, visits, prevOpens, prevVisits, top] = await Promise.all([
  d1(OPENS, [curStart, end]),
  d1(VISITS, [curStart, end]),
  d1(OPENS, [prevStart, curStart]),
  d1(VISITS, [prevStart, curStart]),
  d1(`SELECT c.title, COUNT(*) AS n FROM challenge_views v JOIN challenges c ON c.id = v.challenge_id
      WHERE v.viewed_on >= ?1 AND v.viewed_on < ?2 GROUP BY c.id ORDER BY n DESC LIMIT 5`, [curStart, end]),
])

const total = (rows) => rows.reduce((s, r) => s + Number(r.n), 0)
const ratio = (o, v) => (v ? Math.round((o / v) * 100) / 100 : 0)
const o = new Map(opens.map((r) => [r.d, Number(r.n)]))
const v = new Map(visits.map((r) => [r.d, Number(r.n)]))

const out = {
  value: ratio(total(opens), total(visits)),
  previous: ratio(total(prevOpens), total(prevVisits)),
  series: windowDays.map((d) => [d, ratio(o.get(d) ?? 0, v.get(d) ?? 0)]),
  rows: top.map((r) => [r.title.length > 48 ? `${r.title.slice(0, 47)}…` : r.title, Number(r.n)]),
}
if (!total(visits)) out.note = 'no visitors in range'
emit(out)
