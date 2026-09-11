import { useEffect, useRef, useState } from 'react'
import '../styles/newspaper/odometer.css'

/**
 * The site hit counter, as a row of mechanical digit wheels.
 *
 * One POST per page load. The ref guards React's double-invoke in development;
 * the server dedupes a refresh by (visitor, day), so a reload is a no-op insert
 * that still returns the current total.
 *
 * `initial` is the number baked in at build time. It is displayed immediately
 * and rolled up to the live figure when the POST answers, so the counter never
 * shows a placeholder zero that then jumps - the wheels start at the last known
 * total and move to the real one.
 */
export default function HitCounter({ initial = 0 }: { initial?: number }) {
  const [views, setViews] = useState(initial)
  const pinged = useRef(false)

  useEffect(() => {
    if (pinged.current) return
    pinged.current = true
    void fetch('/api/site/view', { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) return
        const { views: total } = await response.json() as { views: number }
        // Never roll backwards: a stale build-time number is the only reason
        // the two could disagree, and a counter that ticks down reads as broken.
        setViews((previous) => Math.max(previous, total))
      })
      .catch(() => {})
  }, [])

  // Grouped into thousands so the row reads as a number. Minimum six wheels,
  // the way a counter that expected traffic was always padded.
  const digits = String(Math.max(views, 0)).padStart(6, '0').split('')

  return (
    <span className="np-odometer" role="img" aria-label={`${views.toLocaleString('en')} visits to this site`}>
      {digits.map((digit, i) => {
        const fromEnd = digits.length - 1 - i
        return (
          <span key={i}>
            {fromEnd > 0 && fromEnd % 3 === 2 && i > 0 && <span className="np-odometer-sep" aria-hidden="true">,</span>}
            <span className="np-odometer-digit" aria-hidden="true">
              <span
                className="np-odometer-strip"
                style={{ '--digit': digit, '--spin': fromEnd } as React.CSSProperties}
              >
                {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          </span>
        )
      })}
    </span>
  )
}
