import { useEffect, useState } from 'react'
import type { Challenge } from '../../../../packages/types/index'
import { TYPE_LABEL, ago, typeColor } from '../lib/vocab'

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
    fetch('/api/challenges?limit=30', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setFresh(d.challenges.filter((c: Challenge) => !seen.has(c.slug)))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!fresh.length) return null

  return (
    <div>
      {fresh.map((c) => (
        <a
          key={c.id}
          href={`/c/${c.slug}`}
          className="flex gap-3 border-b border-(--color-rule-soft) px-3 py-3 hover:bg-(--color-paper-sunk)"
        >
          {c.media[0]
            ? <img src={c.media[0].url} alt="" className="h-14 w-14 shrink-0 border border-(--color-rule-soft) object-cover" />
            : <span className="h-14 w-14 shrink-0 border border-dashed border-(--color-rule-soft)" />}
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span
                className="font-[family-name:--font-mono] text-[0.62rem] tracking-[0.1em] uppercase"
                style={{ color: typeColor(c.type) }}
              >
                {TYPE_LABEL[c.type]}
              </span>
              <span className="font-[family-name:--font-mono] text-[0.62rem] text-(--color-ink-faint)">{ago(c.created_at)}</span>
            </span>
            <span className="mt-0.5 block truncate font-[family-name:--font-display] text-[1.05rem] leading-snug">
              {c.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-(--color-ink-faint)">{c.summary}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
