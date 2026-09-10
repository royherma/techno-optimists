import { useEffect, useState } from 'react'
import { type Snack, dismiss, drainSignal, subscribe } from '../lib/snack'

/**
 * Where short messages land. One of these per page, mounted by Base.astro.
 *
 * It sits outside the sheet rather than inside it: the sheet is the document,
 * and a message about what just happened is not part of the document. Bottom
 * on a phone (near the thumb, clear of the post FAB's corner), bottom-left on
 * a wide screen where the sheet has margins to spare.
 */
export default function Snack() {
  const [snacks, setSnacks] = useState<Snack[]>([])

  useEffect(() => {
    const unsubscribe = subscribe(setSnacks)
    // The sign-in redirect lands on a fresh page with no React state, so the
    // only trace of what happened is the cookie the API left. Read it here,
    // once, after this host is listening - a snack() before subscribe() would
    // be published to nobody.
    drainSignal()
    return unsubscribe
  }, [])

  if (snacks.length === 0) return null

  return (
    /*
     * aria-live on the container, not the message: a live region has to be in
     * the DOM before the text arrives or a screen reader announces nothing.
     * This host is always mounted, so the region is always there and each new
     * snack is a mutation inside it. `polite` because none of this interrupts
     * what the reader is doing - even a failure is about a click they already
     * know they made.
     */
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-sm"
    >
      {snacks.map((s) => (
        <div
          key={s.id}
          className={`snack pointer-events-auto flex items-start gap-3 border-l-[3px] bg-(--color-paper) px-3.5 py-2.5 text-sm shadow-[0_2px_10px_rgba(0,0,0,0.10)] ${
            s.tone === 'problem'
              ? 'border-(--color-problem) text-(--color-ink)'
              : 'border-(--color-ideas) text-(--color-ink)'
          }`}
        >
          <span className="min-w-0 flex-1">{s.text}</span>
          <button
            type="button"
            onClick={() => dismiss(s.id)}
            aria-label="Dismiss"
            className="ink-transition -mr-1 shrink-0 px-1 leading-none text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            x
          </button>
        </div>
      ))}

      <style>{`
        /*
         * Rises from just below its resting place. 8px, not a slide across the
         * screen: the sheet's own transitions are all small and quick, and a
         * message that flies in reads as a different product than the one it
         * is interrupting.
         *
         * global.css zeroes every animation under prefers-reduced-motion, so
         * this needs no media query of its own - the snack still appears, it
         * just appears rather than moves.
         */
        .snack {
          animation: snack-rise 160ms ease-out;
        }
        @keyframes snack-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
