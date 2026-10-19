import { ae, aeAlive, emit, fillSeries, currentAEWindow, previousAEWindow } from './_cf.mjs'

const ERR = `(blob2 = 'client_error' OR double2 >= 500)`

await aeAlive()
const [[cur], [prev], daily, paths] = await Promise.all([
  ae(`SELECT count() AS n FROM to_events WHERE ${ERR} AND ${currentAEWindow}`),
  ae(`SELECT count() AS n FROM to_events WHERE ${ERR}
      AND ${previousAEWindow}`),
  ae(`SELECT formatDateTime(timestamp, '%Y-%m-%d') AS d, count() AS n FROM to_events
      WHERE ${ERR} AND ${currentAEWindow} GROUP BY d`),
  ae(`SELECT if(blob2 = 'client_error', 'browser', 'server 5xx') AS side, blob1 AS path, count() AS n FROM to_events
      WHERE ${ERR} AND ${currentAEWindow} GROUP BY side, path ORDER BY n DESC LIMIT 6`),
])

emit({
  value: Number(cur.n),
  previous: Number(prev.n),
  target: 0,
  series: fillSeries(daily),
  rows: paths.map((p) => [`${p.side} ${p.path}`, Number(p.n)]),
})
