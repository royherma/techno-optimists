import { useEffect, useState } from 'react'
import type { ActionKind, Challenge } from '../../../../packages/types/index'
import { ACTION_LABEL, count } from '../lib/vocab'
import { snack } from '../lib/snack'

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
  // A Challenge posted since the last build is served on another Challenge's
  // prerendered page, so these props describe the shell, not what the reader is
  // looking at. Trust the marker over the props and load the real thing.
  const live = typeof window !== 'undefined'
    ? (window as unknown as { __LIVE_CHALLENGE__?: string }).__LIVE_CHALLENGE__
    : undefined

  const [realSlug, setRealSlug] = useState(live ?? slug)
  const [realType, setRealType] = useState<Challenge['type']>(type)
  const [counts, setCounts] = useState(actions)
  const [mine, setMine] = useState<ActionKind[]>([])
  const [busy, setBusy] = useState<ActionKind | null>(null)
  const [ready, setReady] = useState(!live)

  useEffect(() => {
    if (!live) return
    let cancelled = false
    fetch(`/api/challenges/${live}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        setRealSlug(d.challenge.slug)
        setRealType(d.challenge.type)
        setCounts(d.challenge.actions)
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => { cancelled = true }
  }, [live])

  async function act(kind: ActionKind) {
    if (mine.includes(kind) || busy) return
    setBusy(kind)
    // Optimistic: the count moves now, and reconciles from the response below.
    setCounts((c) => ({ ...c, [kind]: c[kind] + 1 }))
    setMine((m) => [...m, kind])
    try {
      const r = await fetch(`/api/challenges/${realSlug}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind }),
      })
      // Acting is the moment signing in is worth it, so ask then - not at the
      // door. Come back to this Challenge afterwards, not to the home page.
      if (r.status === 401) {
        window.location.href = `/signin?next=/c/${realSlug}`
        return
      }
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json()
      if (data.actions) setCounts(data.actions)
    } catch {
      // The rollback alone is invisible: the count returns to where it was and
      // the button un-presses, which reads as the click never having landed.
      // Say that it failed, or the reader retries into the same silence.
      setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] - 1) }))
      setMine((m) => m.filter((k) => k !== kind))
      snack('That did not save. Try again.', 'problem')
    } finally {
      setBusy(null)
    }
  }

  // Showing the shell's actions for a moment would be showing the wrong facts.
  if (!ready) return <div className="h-10" />

  return (
    <div className="flex flex-wrap gap-2">
      {FOR_TYPE[realType].map((kind) => {
        const on = mine.includes(kind)
        const pending = busy === kind
        return (
          <button
            key={kind}
            onClick={() => act(kind)}
            disabled={on || busy === kind}
            aria-pressed={on}
            className={`ink-transition rounded-full border px-4 py-2 text-sm ${
              on
                ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper) cursor-default'
                : pending
                  ? 'border-(--color-rule) bg-(--color-paper-sunk) text-(--color-ink-soft) cursor-wait'
                  : 'border-(--color-rule-soft) text-(--color-ink-soft) hover:border-(--color-rule) hover:bg-(--color-paper-sunk) hover:text-(--color-ink) active:bg-(--color-table)'
            }`}
          >
            {ACTION_LABEL[kind]}
            <span className={`ml-2 tabular-nums ${on ? 'text-(--color-paper)' : 'text-(--color-ink-faint)'}`}>
              {count(counts[kind])}
            </span>
          </button>
        )
      })}
    </div>
  )
}
