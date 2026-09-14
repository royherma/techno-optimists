import { useEffect, useState } from 'react'
import '../../styles/newspaper/compute.css'

/**
 * Draft a response with your own AI credits, inside the composer.
 *
 * Why it lives here and not in a floating panel: the thing a donor wanted all
 * along was to contribute an answer. A panel that printed model output beside
 * the thread produced something nobody could do anything with. Here the output
 * lands in the box the person was already going to type in, they edit it, and
 * they publish it under their own name.
 *
 * The original model text is kept server-side on the run row and never
 * rewritten, so "what did the model actually say" stays answerable after any
 * amount of editing.
 */

export type DraftKind = 'idea' | 'explanation' | 'solution' | 'question'

export type DraftRun = {
  id: string
  model: string
  cost_usd: number | null
  draft: { kind: DraftKind; title: string; body: string }
}

/**
 * The model's judgement mapped onto the labels the composer offers.
 *
 * The site's `kind` column has a CHECK constraint over five values and gains
 * no new ones for this: "explanation" and "solution" are things a model can
 * usefully distinguish while writing, not new kinds of response. A solution is
 * an idea with more of it worked out; an explanation is a comment.
 */
export const COMPOSER_KIND: Record<DraftKind, 'comment' | 'idea' | 'question'> = {
  idea: 'idea',
  solution: 'idea',
  explanation: 'comment',
  question: 'question',
}

/** What the model decided this thread needed, said to the person in their terms. */
const CHOSE: Record<DraftKind, string> = {
  idea: 'This thread understands the problem, so this is something to try.',
  explanation: 'This thread needed the mechanism, so this explains why it happens.',
  solution: 'Enough is understood here, so this is a plan someone could follow.',
  question: 'A fact is missing here, so this asks for it.',
}

const PROBLEMS: Record<string, string> = {
  signin_required: 'Sign in first, then this runs on your credits.',
  no_account: 'Connect an AI account to draft with your own credits.',
  no_credit: 'That account has no credit left. Top it up and try again.',
  revoked: 'That account is no longer authorized. Reconnect it and try again.',
  rate_limited_person: 'You have run a lot in the last hour. Try again shortly.',
  rate_limited_challenge: 'This thread has had plenty of runs today. Try again tomorrow.',
  unavailable: 'The provider could not be reached. Try again in a moment.',
  refused: 'No available model would take this. Try again later.',
  not_found: 'This thread could not be found.',
}

/** Cents, not dollars, below a cent: "$0.00" reads as free and this is not free. */
const money = (usd: number | null) => {
  if (usd === null) return null
  if (usd < 0.01) return `${(usd * 100).toFixed(1)} cents`
  return `$${usd.toFixed(2)}`
}

export default function DraftWithCompute({
  slug,
  hasBody,
  onDraft,
}: {
  slug: string
  hasBody: boolean
  onDraft: (run: DraftRun) => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [last, setLast] = useState<DraftRun | null>(null)
  const [connected, setConnected] = useState(false)

  // Coming back from the provider lands on the thread with ?connected=1. Say
  // so here, where the person was standing when they left.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('connected')) {
      setConnected(true)
      params.delete('connected')
      const q = params.toString()
      history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
    }
  }, [])

  async function draft() {
    // Overwriting something the person already typed is not recoverable, so it
    // is their decision, made before the money is spent.
    if (hasBody && !confirm('Replace what you have written with a fresh draft?')) return
    setBusy(true); setProblem(null); setConnected(false)
    try {
      // The community router mounted at /api/challenges rejects any non-GET
      // without a JSON content-type, before the handler runs.
      const r = await fetch(`/api/challenges/${encodeURIComponent(slug)}/ai/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const body = await r.json().catch(() => null)
      if (!r.ok) {
        setProblem(PROBLEMS[body?.error] ?? PROBLEMS.unavailable)
        return
      }
      if (body?.run?.draft) {
        setLast(body.run as DraftRun)
        onDraft(body.run as DraftRun)
      } else {
        setProblem(PROBLEMS.unavailable)
      }
    } catch {
      setProblem(PROBLEMS.unavailable)
    } finally { setBusy(false) }
  }

  const needsAccount = problem === PROBLEMS.no_account || problem === PROBLEMS.revoked
  const needsSignin = problem === PROBLEMS.signin_required
  const here = encodeURIComponent(`/c/${slug}#discussion`)

  return <div className="draft-assist">
    <div className="draft-assist-head">
      <span aria-hidden="true">⚡</span>
      <div>
        <p className="draft-assist-title">Draft this with your own AI credits</p>
        <p className="draft-assist-sub">
          A frontier model reads the thread and writes a contribution. You edit it
          and publish it as yours.
        </p>
      </div>
    </div>

    {connected && <p className="draft-assist-notice" role="status">
      Account connected. Draft it now - this one is on your credits.
    </p>}

    {problem && <p className="draft-assist-problem" role="alert">{problem}</p>}

    {needsSignin
      ? <a className="draft-assist-go" href={`/signin?next=${here}`}>Sign in to draft</a>
      : needsAccount
        ? <a className="draft-assist-go" href={`/api/ai/connect?next=${here}`}>Connect an AI account</a>
        : <button type="button" className="draft-assist-go" disabled={busy} onClick={() => void draft()}>
            {busy ? 'Reading the thread...' : last ? 'Draft another' : 'Write a draft on my credits'}
          </button>}

    {busy && <p className="draft-assist-wait" role="status">
      This takes about half a minute.
    </p>}

    {last && !busy && <p className="draft-assist-done" role="status">
      {CHOSE[last.draft.kind]} It is in the box below - edit it however you like.
      {money(last.cost_usd) ? ` This run cost you ${money(last.cost_usd)}.` : ''}
    </p>}
  </div>
}
