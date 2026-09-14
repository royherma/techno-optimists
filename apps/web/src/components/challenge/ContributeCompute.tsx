import { useEffect, useState } from 'react'
import '../../styles/newspaper/compute.css'

/**
 * The floating offer on a thread: point your own AI credits at this problem.
 *
 * Why a floating button and not a row in the action bar: the action bar is
 * where a reader says what they are (I have this problem, I can help). This is
 * a different kind of act - spending your own money on a stranger's problem -
 * and burying it in a list of free taps reads as one more checkbox.
 *
 * It stays collapsed until pressed. Nothing is spent on a hover, and a reader
 * who never presses it never sees a model name or a provider.
 */

type Run = {
  id: string
  action: string
  model: string
  output: string
  created_at: string
  by: { handle: string; name: string; avatar_url: string | null }
}

const PROBLEMS: Record<string, string> = {
  signin_required: 'Sign in first, then this runs on your credits.',
  no_account: 'Connect an AI account to run this.',
  no_credit: 'That account has no credit left. Top it up and run this again.',
  revoked: 'That account is no longer authorized. Reconnect it and try again.',
  rate_limited_person: 'You have run a lot in the last hour. Try again shortly.',
  rate_limited_challenge: 'This thread has had plenty of runs today. Try again tomorrow.',
  unavailable: 'The provider could not be reached. Try again in a moment.',
  refused: 'No available model would take this. Try again later.',
  unknown_action: 'That is not something that can be run here.',
  not_found: 'This thread could not be found.',
}

export default function ContributeCompute({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])

  // Past runs are public and load with the thread: the attribution is the point
  // of the feature, and a thread that already shows donated work is the best
  // argument for donating more.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/challenges/${encodeURIComponent(slug)}/ai/runs`, { cache: 'no-store' })
        if (r.ok) setRuns((await r.json()).runs ?? [])
      } catch { /* a thread reads fine without them */ }
    })()
  }, [slug])

  async function run() {
    setBusy(true); setProblem(null)
    try {
      // The community router mounted at /api/challenges (apps/api/src/index.ts)
      // rejects any non-GET without a JSON content-type, before the handler
      // runs. The body is empty on purpose - the slug and action are the route.
      const r = await fetch(`/api/challenges/${encodeURIComponent(slug)}/ai/structure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const body = await r.json().catch(() => null)
      if (!r.ok) {
        const code = body?.error ?? 'unavailable'
        setProblem(PROBLEMS[code] ?? PROBLEMS.unavailable)
        // Not connected, or not signed in, is not a failure - it is the next
        // step, so the panel offers it rather than only naming it.
        return
      }
      if (body?.run) setRuns((prev) => [body.run as Run, ...prev])
    } catch {
      setProblem(PROBLEMS.unavailable)
    } finally { setBusy(false) }
  }

  const needsAccount = problem === PROBLEMS.no_account || problem === PROBLEMS.revoked
  const needsSignin = problem === PROBLEMS.signin_required

  return <>
    <button
      type="button"
      className="compute-fab"
      aria-expanded={open}
      aria-controls="compute-panel"
      onClick={() => setOpen((v) => !v)}
    >
      <span aria-hidden="true">⚡</span>
      <span>Contribute compute</span>
    </button>

    <div id="compute-panel" className="compute-panel" hidden={!open}>
      <header className="compute-head">
        <h2>Put your AI credits on this problem</h2>
        <button type="button" className="compute-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </header>

      <p className="compute-lede">
        Run a frontier model over this thread using your own account. It restates the
        problem, names what makes it hard, and suggests where to start. The thread
        records that it was you.
      </p>

      {problem && <p className="compute-problem" role="alert">{problem}</p>}

      {needsSignin
        ? <a className="compute-go" href={`/signin?next=${encodeURIComponent(`/c/${slug}`)}`}>Sign in to contribute</a>
        : needsAccount
          ? <a className="compute-go" href={`/api/ai/connect?next=${encodeURIComponent(`/c/${slug}`)}`}>Connect an AI account</a>
          : <button type="button" className="compute-go" disabled={busy} onClick={() => void run()}>
              {busy ? 'Working on it...' : 'Run this on my credits'}
            </button>}

      {runs.length > 0 && <section className="compute-runs" aria-label="Contributed runs">
        {runs.map((r) => <article key={r.id} className="compute-run">
          <h3>Structured by @{r.by.handle}, on their own credits</h3>
          <pre>{r.output}</pre>
          <p className="compute-model">{r.model}</p>
        </article>)}
      </section>}
    </div>
  </>
}
