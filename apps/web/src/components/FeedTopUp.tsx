import { useEffect, useState } from 'react'
import type { Challenge } from '../../../../packages/types/index'
import { ACTION_LABEL, count, TYPE_LABEL, ago, typeColor } from '../lib/vocab'

/**
 * Challenges posted since the last build.
 *
 * The index is prerendered, so someone who posts a Challenge would not see it
 * on the front page until the next deploy - which reads as "my post vanished".
 * This asks the API what the feed actually holds and draws anything the built
 * page is missing, above the printed index.
 */
export default function FeedTopUp({ known }: { known: string[] }) {
  const [fresh, setFresh] = useState<Challenge[]>([])

  useEffect(() => {
    let cancelled = false
    const seen = new Set(known)
    const refresh = () => fetch('/api/challenges?limit=50', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        for (const c of d.challenges as Challenge[]) {
          document.querySelectorAll<HTMLElement>('[data-feed-row][data-slug]').forEach((row) => {
            if (row.dataset.slug !== c.slug) return
            const emoji = row.querySelector('[data-feed-emoji]')
            if (emoji) emoji.textContent = c.emoji ? `${c.emoji} ` : ''
            const title = row.querySelector('[data-feed-title]')
            if (title) title.textContent = c.title
            const summary = row.querySelector('[data-feed-summary]')
            if (summary) summary.textContent = c.summary
            row.dataset.search = `${c.title} ${c.summary} ${c.location ?? ''} ${c.tags.join(' ')}`.toLowerCase()
          })
          document.querySelectorAll<HTMLElement>('[data-challenge]').forEach((el) => {
            if (el.dataset.challenge !== c.slug) return
            const kind = el.dataset.action as keyof Challenge['actions']
            if (!kind) return
            const label = `${ACTION_LABEL[kind]} - ${c.actions[kind]}`
            el.setAttribute('aria-label', label)
            el.title = label
            const value = el.querySelector('span')
            if (value) value.textContent = count(c.actions[kind])
          })
        }
        setFresh(d.challenges.filter((c: Challenge) => !seen.has(c.slug)))
      })
      .catch(() => {})
    void refresh()
    window.addEventListener('pageshow', refresh)
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; window.removeEventListener('pageshow', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  useEffect(() => { window.dispatchEvent(new Event('feed-updated')) }, [fresh])

  if (!fresh.length) return null

  return (
    <div>
      {fresh.map((c) => (
        <a
          key={c.id}
          data-feed-row
          data-type={c.type}
          data-search={`${c.title} ${c.summary} ${c.location ?? ''} ${c.tags.join(' ')}`.toLowerCase()}
          href={`/c/${c.slug}`}
          className="flex gap-3 border-b border-(--color-rule-soft) px-3 py-3 hover:bg-(--color-paper-sunk)"
        >
          {c.media[0]
            ? <img src={c.media[0].url} alt="" className="h-14 w-14 shrink-0 border border-(--color-rule-soft) object-cover" />
            : <span className="h-14 w-14 shrink-0 border border-dashed border-(--color-rule-soft)" />}
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span
                className="font-[family-name:var(--font-mono)] text-[0.62rem] tracking-[0.1em] uppercase"
                style={{ color: typeColor(c.type) }}
              >
                {TYPE_LABEL[c.type]}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[0.62rem] text-(--color-ink-faint)">{ago(c.created_at)}</span>
            </span>
            <span className="mt-0.5 block truncate font-[family-name:var(--font-display)] text-[1.05rem] leading-snug">
              {c.emoji && <span aria-hidden="true">{c.emoji} </span>}{c.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-(--color-ink-faint)">{c.summary}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
