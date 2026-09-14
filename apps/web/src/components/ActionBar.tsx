import { useEffect, useRef, useState } from 'react'
import type { ActionKind, Challenge, CommentKind } from '../../../../packages/types/index'
import { ACTION_LABEL } from '../lib/vocab'
import { snack } from '../lib/snack'
import '../styles/activity.css'

/**
 * The one contribution control. Which actions appear depends on the Challenge's
 * type - offering "I have this problem" on someone's Build is noise.
 */
const ACTION_ICON: Record<ActionKind, string> = { have_problem: 'plus', want_this: 'plus', have_idea: 'lightbulb', can_help: 'users', will_test: 'play', building_this: 'rocket', follow: 'star' }

/**
 * Which actions are worth saying something about, and the response label each
 * one picks. Only the five kinds in COMMENT_KINDS are valid - anything else is
 * ignored by the composer - so "I can help" lands on comment rather than
 * inventing an "offer" label the API would reject.
 *
 * Absent on purpose: follow (a subscription, nothing to say) and have_problem /
 * want_this (a show of hands; the count is the point, and forcing a text box
 * would make the cheapest signal the most expensive one to give).
 */
const COMPOSE_KIND: Partial<Record<ActionKind, CommentKind>> = {
  have_idea: 'idea',
  can_help: 'comment',
  // Not test_result: they are offering to run a test, not reporting one they
  // already ran. The result label belongs on the write-up that comes after.
  will_test: 'comment',
  building_this: 'comment',
}

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
    const refresh = () => setRetry((n) => n + 1)
    window.addEventListener('challenge-comment', refresh)
    return () => window.removeEventListener('challenge-comment', refresh)
  }, [])

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
      setStatus('')
    }).catch(() => {
      if (!cancelled) { setError(true); setStatus('Your selections could not load.') }
    })
    return () => { cancelled = true }
  }, [live, slug, retry])

  async function act(kind: ActionKind) {
    // A count on its own tells the thread's author that someone can help but
    // not how, which is the dead end these buttons used to lead to. The ones
    // that carry something worth writing open the composer with the matching
    // label chosen. Following is a subscription, not a contribution, so it
    // stays a silent toggle - the count IS the whole message there.
    const writes = COMPOSE_KIND[kind]
    if (writes) {
      window.dispatchEvent(new CustomEvent('compose-idea', { detail: { kind: writes } }))
      // have_idea has never been a counted action: the idea itself is the
      // record. The rest still register, so the author sees the tally too.
      if (kind === 'have_idea') return
    }
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
            data-action-kind={kind}
            onClick={() => act(kind)}
            disabled={busy !== null}
            type="button"
            title={kind === 'have_idea' ? 'Write your idea' : on ? `Undo: ${ACTION_LABEL[kind]}` : COMPOSE_KIND[kind] ? `${ACTION_LABEL[kind]} - and say how` : ACTION_LABEL[kind]}
            aria-pressed={kind === 'have_idea' ? undefined : on}
            className={`feedback-control ink-transition rounded-full border px-4 py-2 text-sm ${
              on
                ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper)'
                : pending
                  ? 'border-(--color-rule) bg-(--color-paper-sunk) text-(--color-ink-soft) cursor-wait'
                  : 'border-(--color-rule-soft) text-(--color-ink-soft) hover:border-(--color-rule) hover:bg-(--color-paper-sunk) hover:text-(--color-ink) active:bg-(--color-table)'
            }`}
          >
            <span className="action-label"><span className="action-icon" aria-hidden="true"><img src={`/icons/${ACTION_ICON[kind]}.svg`} width="20" height="20" alt="" /></span><span>{ACTION_LABEL[kind]}{kind === 'have_idea' && <small>Write your idea ↗</small>}</span>{on && <span className="action-check" aria-hidden="true">✓</span>}</span>
            <span className={`action-count ml-2 tabular-nums ${on ? 'text-(--color-paper)' : 'text-(--color-ink-faint)'}`}>
              {counts[kind].toLocaleString('en-US')}
            </span>
          </button>
        )
      })}
      </div>
      <p className="action-status" role="status" aria-live="polite">{status}</p>
      <a className="action-account" href="/settings#activity">View your marked threads →</a>
    </div>
  )
}
