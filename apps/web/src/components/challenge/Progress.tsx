import { formatDateTime, dateISO } from '../../lib/dates'
import { useRef, useState } from 'react'
import type { Challenge, Update } from '../../../../../packages/types/index'
import type { Me } from '../../lib/session'
import { STAGE_ORDER, STAGE_STAMP, ago } from '../../lib/vocab'

export default function Progress({ challenge, updates, me, refresh }: { challenge: Challenge; updates: Update[]; me: Me | null; refresh: () => Promise<void> }) {
  const [body, setBody] = useState('')
  const [stage, setStage] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const canMove = me?.is_admin || me?.id === challenge.author.id
  async function publish(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('')
    try {
      const r = await fetch(`/api/challenges/${challenge.slug}/updates`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, ...(stage ? { stage } : {}) }) })
      if (!r.ok) throw new Error(r.status === 401 ? 'Your session ended. Sign in again; your text is still here.' : 'That update did not save. Try again.')
      setBody(''); setStage(''); setMessage('Progress update published.')
      await refresh()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'That update did not save. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <section id="progress" className="detail-section progress-log">
    <h2>Progress log</h2><p className="section-intro">What was tried, what happened, and what comes next.</p>
    {updates.length ? <ol>{updates.map((u) => <li key={u.id}><span className="progress-dot" style={{ background: `var(--color-${u.stage ?? challenge.stage})` }} aria-hidden="true" /><div>
      <div className="update-byline"><a href={`/people?handle=${encodeURIComponent(u.author.handle)}`}><strong>@{u.author.handle}</strong></a>{u.stage && <span>{STAGE_STAMP[u.stage]}</span>}<time dateTime={dateISO(u.created_at)} title={formatDateTime(u.created_at)}>{ago(u.created_at)}</time></div>
      <p className="response-body">{u.body}</p>
      {u.media.map((m) => m.kind === 'video' ? <video key={m.url} src={m.url} controls playsInline /> : <img key={m.url} src={m.url} alt={m.alt ?? ''} loading="lazy" />)}
    </div></li>)}</ol> : <p className="quiet-empty">No progress updates yet. Tried something? Record the result here. Questions and ideas belong in <a href="#discussion">discussion</a>.</p>}
    {me ? <details className="progress-editor"><summary>Add a progress update</summary><form onSubmit={publish} className="compact-form">
      <label htmlFor="progress-body">What changed?</label><textarea id="progress-body" required maxLength={10000} rows={4} value={body} disabled={busy} onChange={(e) => setBody(e.target.value)} placeholder="Describe what you tried and what you learned." />
      {canMove && <label>Stage after this update<select value={stage} disabled={busy} onChange={(e) => setStage(e.target.value)}><option value="">Keep current stage ({STAGE_STAMP[challenge.stage]})</option>{STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_STAMP[s]}</option>)}</select></label>}
      <button className="primary-control" disabled={busy || !body.trim()}>{busy ? 'Publishing…' : 'Publish update'}</button>
      {message && <p role="status">{message}</p>}
    </form></details> : <a className="text-control" href={`/signin?next=${encodeURIComponent(`/c/${challenge.slug}#progress`)}`}>Sign in to add a progress update</a>}
  </section>
}
