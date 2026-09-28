import { d1, ae, aeAlive, emit, fillSeries, curStart, prevStart, end, DAYS } from './_cf.mjs'

// site_views holds one row per visitor per UTC day, so a sum over days counts visitor-days.
const SUM = 'SELECT COUNT(*) AS n FROM site_views WHERE viewed_on >= ?1 AND viewed_on < ?2'

await aeAlive()
const [[cur], [prev], daily, pages] = await Promise.all([
  d1(SUM, [curStart, end]),
  d1(SUM, [prevStart, curStart]),
  d1('SELECT viewed_on AS d, COUNT(*) AS n FROM site_views WHERE viewed_on >= ?1 AND viewed_on < ?2 GROUP BY d', [curStart, end]),
  // The beacon's Referer is the page it fired from, so blob4 is the landing page, not the source site.
  ae(`SELECT blob4 AS page, count() AS n FROM to_events
      WHERE blob2 = 'site_view' AND timestamp > NOW() - INTERVAL '${DAYS}' DAY
      GROUP BY page ORDER BY n DESC LIMIT 50`),
])

const label = (ref) => {
  try { return new URL(ref).pathname } catch { return ref || '(none)' }
}
const byPage = new Map()
for (const p of pages) byPage.set(label(p.page), (byPage.get(label(p.page)) ?? 0) + Number(p.n))

emit({
  value: Number(cur.n),
  previous: Number(prev.n),
  note: 'includes your own visits',
  series: fillSeries(daily),
  rows: [...byPage].sort((a, b) => b[1] - a[1]).slice(0, 6),
})
