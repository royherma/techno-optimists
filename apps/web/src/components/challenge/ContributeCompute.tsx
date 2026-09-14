import { useEffect, useRef, useState } from 'react'
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

/** What the reader gets back, in their words. Shown before and during a run so
 *  "Working on it" is never the only thing on screen. */
const PRODUCES = [
  'A clear restatement of the problem',
  'What actually makes it hard',
  'Where someone should start',
]

const when = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function ContributeCompute({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [connected, setConnected] = useState(false)
  const latest = useRef<HTMLElement | null>(null)

  // Coming back from the provider lands on the thread with ?connected=1. The
  // panel must open by itself: a reader who just authorized an account and
  // sees an unchanged page assumes it failed. Strip the param so a refresh
  // does not replay it.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('connected')) {
      setOpen(true)
      setConnected(true)
      params.delete('connected')
      const q = params.toString()
      history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
    }
  }, [])

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
    setBusy(true); setProblem(null); setConnected(false)
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
      if (body?.run) {
        const fresh: Run = {
          id: body.run.id,
          action: body.run.action,
          model: body.run.model,
          output: body.run.output,
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          by: { handle: body.run.by_handle, name: body.run.by_name, avatar_url: null },
        }
        setRuns((prev) => [fresh, ...prev])
        // The answer is the whole point of pressing the button, so put it in
        // front of the reader instead of leaving it below the fold of a
        // scrolling panel.
        requestAnimationFrame(() => latest.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }
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
        Run a frontier model over this thread using your own account. The thread
        records that it was you.
      </p>

      {connected && <p className="compute-notice" role="status">
        Account connected. Run it now - this one is on your credits.
      </p>}

      {problem && <p className="compute-problem" role="alert">{problem}</p>}

      {!needsSignin && !needsAccount && <div className="compute-produces">
        <p className="compute-produces-head">{busy ? 'Reading the thread and writing:' : 'You get back:'}</p>
        <ul>{PRODUCES.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>}

      {needsSignin
        ? <a className="compute-go" href={`/signin?next=${encodeURIComponent(`/c/${slug}`)}`}>Sign in to contribute</a>
        : needsAccount
          ? <a className="compute-go" href={`/api/ai/connect?next=${encodeURIComponent(`/c/${slug}`)}`}>Connect an AI account</a>
          : <button type="button" className="compute-go" disabled={busy} onClick={() => void run()}>
              {busy ? 'Writing the breakdown...' : 'Write the breakdown on my credits'}
            </button>}

      {busy && <p className="compute-waiting" role="status">
        A frontier model is reading the thread. This takes about half a minute.
      </p>}

      {runs.length > 0 && <section className="compute-runs" aria-label="Contributed runs">
        <h3 className="compute-runs-head">{runs.length === 1 ? 'The breakdown' : 'Breakdowns on this thread'}</h3>
        {runs.map((r, i) => <article
          key={r.id}
          className="compute-run"
          ref={i === 0 ? (el) => { latest.current = el } : undefined}
        >
          <p className="compute-by">Structured by @{r.by.handle}, on their own credits{r.created_at ? ` · ${when(r.created_at)}` : ''}</p>
          <div className="compute-output">{r.output}</div>
          <p className="compute-model">{r.model}</p>
        </article>)}
      </section>}
    </div>
  </>
}
