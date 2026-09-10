import { useState } from 'react'
import type { ActionKind, Challenge } from '../../../../packages/types/index'
import { ACTION_LABEL, count } from '../lib/vocab'

/**
 * The one contribution control. Which actions appear depends on the Challenge's
 * type - offering "I have this problem" on someone's Build is noise.
 */
const FOR_TYPE: Record<Challenge['type'], ActionKind[]> = {
  problem: ['have_problem', 'have_idea', 'can_help', 'will_test', 'follow'],
  idea: ['want_this', 'have_idea', 'can_help', 'building_this', 'follow'],
  experiment: ['want_this', 'have_idea', 'can_help', 'will_test', 'follow'],
  build: ['want_this', 'can_help', 'will_test', 'follow'],
}

export default function ActionBar({ slug, type, actions }: {
  slug: string
  type: Challenge['type']
  actions: Record<ActionKind, number>
}) {
  const [counts, setCounts] = useState(actions)
  const [mine, setMine] = useState<ActionKind[]>([])
  const [busy, setBusy] = useState<ActionKind | null>(null)

  async function act(kind: ActionKind) {
    if (mine.includes(kind) || busy) return
    setBusy(kind)
    // Optimistic: the count moves now, and reconciles from the response below.
    setCounts((c) => ({ ...c, [kind]: c[kind] + 1 }))
    setMine((m) => [...m, kind])
    try {
      const r = await fetch(`/api/challenges/${slug}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-person-id': 'p_mei' },
        body: JSON.stringify({ kind }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json()
      if (data.actions) setCounts(data.actions)
    } catch {
      setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }))
      setMine((m) => m.filter((k) => k !== kind))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FOR_TYPE[type].map((kind) => {
        const on = mine.includes(kind)
        return (
          <button
            key={kind}
            onClick={() => act(kind)}
            disabled={on || busy === kind}
            aria-pressed={on}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              on
                ? 'border-(--color-signal) bg-(--color-signal-soft) text-(--color-signal)'
                : 'border-(--color-rule) hover:border-(--color-ink-faint)'
            }`}
          >
            {ACTION_LABEL[kind]}
            <span className="ml-2 tabular-nums text-(--color-ink-faint)">{count(counts[kind])}</span>
          </button>
        )
      })}
    </div>
  )
}
