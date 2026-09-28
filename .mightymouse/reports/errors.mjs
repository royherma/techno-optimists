import { ae, aeAlive, emit, fillSeries, windowDays, DAYS } from './_cf.mjs'

const ERR = `(blob2 = 'client_error' OR double2 >= 500)`

await aeAlive()
const [[cur], [prev], daily, paths] = await Promise.all([
  ae(`SELECT count() AS n FROM to_events WHERE ${ERR} AND timestamp > NOW() - INTERVAL '${DAYS}' DAY`),
  ae(`SELECT count() AS n FROM to_events WHERE ${ERR}
      AND timestamp <= NOW() - INTERVAL '${DAYS}' DAY AND timestamp > NOW() - INTERVAL '${2 * DAYS}' DAY`),
  ae(`SELECT formatDateTime(timestamp, '%Y-%m-%d') AS d, count() AS n FROM to_events
      WHERE ${ERR} AND timestamp > NOW() - INTERVAL '${DAYS}' DAY GROUP BY d`),
  ae(`SELECT if(blob2 = 'client_error', 'browser', 'server 5xx') AS side, blob1 AS path, count() AS n FROM to_events
      WHERE ${ERR} AND timestamp > NOW() - INTERVAL '${DAYS}' DAY GROUP BY side, path ORDER BY n DESC LIMIT 6`),
])

const series = fillSeries(daily).filter(([d]) => windowDays.includes(d))

emit({
  value: Number(cur.n),
  previous: Number(prev.n),
  target: 0,
  series,
  rows: paths.map((p) => [`${p.side} ${p.path}`, Number(p.n)]),
})
