import { useEffect } from 'react'

/**
 * Redraws this page for a Challenge posted since the last build.
 *
 * The Worker serves an existing built Challenge page as the shell and sets
 * window.__LIVE_CHALLENGE__ to the slug actually being asked for. Everything
 * on the sheet is text and images, so swapping the content in place keeps the
 * layout, the CSS and the action bar exactly as designed - no second template
 * to drift out of sync with the real one.
 */
export default function LiveChallenge() {
  useEffect(() => {
    const slug = (window as unknown as { __LIVE_CHALLENGE__?: string }).__LIVE_CHALLENGE__
    if (!slug) return

    let cancelled = false
    ;(async () => {
      const r = await fetch(`/api/challenges/${slug}`, { credentials: 'same-origin' })
      if (!r.ok || cancelled) return
      const { challenge } = await r.json()

      document.title = `${challenge.title} - Techno Optimists`

      const setText = (sel: string, value: string) => {
        const el = document.querySelector(sel)
        if (el) el.textContent = value
      }
      setText('[data-field="title"]', challenge.title)
      setText('[data-field="summary"]', challenge.summary)
      setText('[data-field="author"]', challenge.author.name)

      const bodyEl = document.querySelector('[data-field="body"]')
      if (bodyEl) bodyEl.textContent = challenge.body ?? ''

      const hero = document.querySelector<HTMLImageElement>('[data-field="hero"]')
      if (hero) {
        if (challenge.media[0]) {
          hero.src = challenge.media[0].url
          hero.alt = challenge.media[0].alt ?? ''
          hero.closest('figure')?.removeAttribute('hidden')
        } else {
          hero.closest('figure')?.setAttribute('hidden', '')
        }
      }

      // The action bar reads the same marker and loads its own data - a DOM
      // attribute cannot reach a mounted island's props.
    })()

    return () => { cancelled = true }
  }, [])

  return null
}
