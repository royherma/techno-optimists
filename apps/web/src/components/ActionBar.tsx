import { useEffect, useRef, useState } from 'react'
import type { ActionKind, Challenge } from '../../../../packages/types/index'
import { ACTION_LABEL } from '../lib/vocab'
import { snack } from '../lib/snack'
import '../styles/activity.css'

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
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [status, setStatus] = useState('Loading your selections...')
  const [retry, setRetry] = useState(0)
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    setError(false)
    Promise.all([
      fetch(`/api/challenges/${live ?? slug}`, { cache: 'no-store' }),
      fetch(`/api/challenges/${live ?? slug}/actions/me`, { credentials: 'same-origin', cache: 'no-store' }),
    ]).then(async ([detail, personal]) => {
      if (!detail.ok || !personal.ok) throw new Error('load')
      const [d, p] = await Promise.all([detail.json(), personal.json()])
      if (cancelled) return
      setRealSlug(d.challenge.slug)
      setRealType(d.challenge.type)
      setCounts(d.challenge.actions)
      setMine(p.mine)
      setReady(true)
      setStatus('Choose any that fit. Click a selected response to undo.')
    }).catch(() => {
      if (!cancelled) { setError(true); setStatus('Your selections could not load.') }
    })
    return () => { cancelled = true }
  }, [live, slug, retry])

  async function act(kind: ActionKind) {
    if (!ready || inFlight.current) return
    inFlight.current = true
    const active = !mine.includes(kind)
    const previousCounts = counts
    const previousMine = mine
    setBusy(kind)
    // Optimistic: the count moves now, and reconciles from the response below.
    setCounts((c) => ({ ...c, [kind]: Math.max(0, c[kind] + (active ? 1 : -1)) }))
    setMine((m) => active ? [...m, kind] : m.filter((k) => k !== kind))
    setStatus('Saving...')
    try {
      const r = await fetch(`/api/challenges/${realSlug}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind, active }),
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
      const message = active ? `Saved: ${ACTION_LABEL[kind]}.` : `Removed: ${ACTION_LABEL[kind]}.`
      setStatus(message)
      snack(message)
      window.dispatchEvent(new CustomEvent('challenge-action', { detail: { slug: realSlug, actions: data.actions } }))
    } catch {
      // The rollback alone is invisible: the count returns to where it was and
      // the button un-presses, which reads as the click never having landed.
      // Say that it failed, or the reader retries into the same silence.
      setCounts(previousCounts)
      setMine(previousMine)
      setStatus('That did not save. Try again.')
      snack('That did not save. Try again.', 'problem')
    } finally {
      setBusy(null)
      inFlight.current = false
    }
  }

  // Showing the shell's actions for a moment would be showing the wrong facts.
  if (!ready) return <div className="action-status" role="status">{status}
    {error && <button className="feedback-control" type="button" onClick={() => setRetry((n) => n + 1)}>Try again</button>}
  </div>

  return (
    <div className="action-controls">
      <div className="flex flex-wrap gap-2">
      {FOR_TYPE[realType].map((kind) => {
        const on = mine.includes(kind)
        const pending = busy === kind
        return (
          <button
            key={kind}
            onClick={() => act(kind)}
            disabled={busy !== null}
            type="button"
            title={on ? `Undo: ${ACTION_LABEL[kind]}` : ACTION_LABEL[kind]}
            aria-pressed={on}
            className={`feedback-control ink-transition rounded-full border px-4 py-2 text-sm ${
              on
                ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper)'
                : pending
                  ? 'border-(--color-rule) bg-(--color-paper-sunk) text-(--color-ink-soft) cursor-wait'
                  : 'border-(--color-rule-soft) text-(--color-ink-soft) hover:border-(--color-rule) hover:bg-(--color-paper-sunk) hover:text-(--color-ink) active:bg-(--color-table)'
            }`}
          >
            <span>{on && <span aria-hidden="true">✓ </span>}{ACTION_LABEL[kind]}</span>
            <span className={`ml-2 tabular-nums ${on ? 'text-(--color-paper)' : 'text-(--color-ink-faint)'}`}>
              {counts[kind].toLocaleString('en-US')}
            </span>
          </button>
        )
      })}
      </div>
      <p className="action-status" role="status">{status}</p>
      <a className="action-account" href="/settings#activity">View your marked Challenges →</a>
    </div>
  )
}
