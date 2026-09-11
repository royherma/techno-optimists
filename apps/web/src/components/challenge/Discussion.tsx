import { formatDateTime, dateISO } from '../../lib/dates'
import { useEffect, useRef, useState } from 'react'
import type { ChallengeComment, CommentKind } from '../../../../../packages/types/index'
import type { Me } from '../../lib/session'
import { ago } from '../../lib/vocab'

const LABEL: Record<CommentKind, string> = { comment: 'Comment', idea: 'Idea', question: 'Question', evidence: 'Evidence', test_result: 'Test result' }
type Draft = { body: string; kind: CommentKind; parent_id: string | null; request_id: string }
const emptyDraft = (): Draft => ({ body: '', kind: 'comment', parent_id: null, request_id: crypto.randomUUID() })

export default function Discussion({ slug, me, sessionReady }: { slug: string; me: Me | null; sessionReady: boolean }) {
  const [comments, setComments] = useState<ChallengeComment[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ body: '', kind: 'comment', parent_id: null, request_id: '' })
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const inFlight = useRef(false)
  const key = `challenge-discussion:${slug}`

  async function load(older?: string) {
    setLoading(true)
    try {
      const r = await fetch(`/api/challenges/${slug}/comments${older ? `?before=${older}` : ''}`, { cache: 'no-store' })
      if (!r.ok) throw new Error('load')
      const data = await r.json() as { comments: ChallengeComment[]; next_cursor: string | null }
      setComments((previous) => older ? [...data.comments, ...previous].filter((c, i, all) => all.findIndex((v) => v.id === c.id) === i) : data.comments)
      setCursor(data.next_cursor)
      setError('')
    } catch { setError('Discussion could not load. Your draft is still here.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let restored = emptyDraft()
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      if (saved && typeof saved.body === 'string' && saved.kind in LABEL && typeof saved.request_id === 'string') restored = saved
    } catch { /* Storage may be disabled. Writing still works. */ }
    setDraft(restored)
    setReady(true)
    void load()
    const focusIdea = () => {
      setDraft((d) => ({ ...d, kind: 'idea', parent_id: null, request_id: crypto.randomUUID() }))
      input.current?.focus()
      input.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
    }
    window.addEventListener('compose-idea', focusIdea)
    return () => window.removeEventListener('compose-idea', focusIdea)
  }, [slug])

  useEffect(() => {
    if (!ready) return
    try { sessionStorage.setItem(key, JSON.stringify(draft)) } catch { /* Optional convenience. */ }
  }, [draft, ready, key])

  function change(values: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...values, request_id: crypto.randomUUID() }))
    setStatus('')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready || inFlight.current || !draft.body.trim() || !sessionReady) return
    if (!me) { window.location.href = `/signin?next=${encodeURIComponent(`/c/${slug}#discussion`)}`; return }
    inFlight.current = true
    setBusy(true); setError(''); setStatus('')
    try {
      const r = await fetch(`/api/challenges/${slug}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(draft),
      })
      if (r.status === 401) { window.location.href = `/signin?next=${encodeURIComponent(`/c/${slug}#discussion`)}`; return }
      if (!r.ok) throw new Error(r.status === 429 ? 'A few too quickly. Wait a minute, then try again.' : 'Your response did not save. Your draft is still here; try again.')
      setDraft(emptyDraft())
      setStatus('Your response is published.')
      window.dispatchEvent(new Event('challenge-comment'))
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Your response did not save. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  const parent = comments.find((c) => c.id === draft.parent_id)
  return <section id="discussion" className="detail-section discussion">
    <h2>Discussion</h2>
    <p className="section-intro">Share an idea, ask a question, or add what you know.</p>
    <form className="discussion-composer" onSubmit={submit}>
      <label htmlFor="response-body">{draft.parent_id ? `Reply${parent ? ` to @${parent.author.handle}` : ''}` : 'Your response'}</label>
      {draft.parent_id && <button className="text-control" type="button" disabled={busy} onClick={() => change({ parent_id: null })}>Cancel reply</button>}
      <textarea ref={input} id="response-body" maxLength={5000} rows={4} value={draft.body} disabled={busy}
        placeholder="What would you try? What are we missing?" required onChange={(e) => change({ body: e.target.value })} />
      <div className="composer-footer">
        <label className="kind-label">Label <span>(optional)</span>
          <select value={draft.kind} disabled={busy} onChange={(e) => change({ kind: e.target.value as CommentKind })}>
            {Object.entries(LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        <button className="primary-control" disabled={busy || !ready || !sessionReady || !draft.body.trim()}>{busy ? 'Publishing…' : me ? 'Publish response' : 'Sign in to respond'}</button>
      </div>
      {sessionReady && !me && <p className="composer-note">You can write first. Sign in to publish; your draft stays in this tab.</p>}
      {status && <p role="status" className="composer-note">{status}</p>}
    </form>
    {error && <p className="form-error" role="alert">{error} <button className="text-control" type="button" disabled={loading} onClick={() => void load()}>Reload discussion</button></p>}
    {cursor && <button className="text-control" disabled={loading} onClick={() => void load(cursor)}>Load earlier responses</button>}
    {loading && <p role="status" className="quiet-empty">Loading responses…</p>}
    {!loading && !error && !comments.length && <p className="quiet-empty">Start the conversation. A useful question is a contribution too.</p>}
    <ol className="discussion-list">{comments.map((comment) => {
      const repliedTo = comments.find((c) => c.id === comment.parent_id)
      return <li id={`response-${comment.id}`} key={comment.id} className={comment.parent_id ? 'is-reply' : ''}>
        <div className="update-byline"><a href={`/people?handle=${encodeURIComponent(comment.author.handle)}`}><strong>@{comment.author.handle}</strong></a>
          {comment.kind !== 'comment' && <span className="response-kind">{LABEL[comment.kind]}</span>}
          <time dateTime={dateISO(comment.created_at)} title={formatDateTime(comment.created_at)}>{ago(comment.created_at)}</time></div>
        {comment.parent_id && <p className="reply-context">Replying to {repliedTo ? <a href={`#response-${repliedTo.id}`}>@{repliedTo.author.handle}</a> : 'an earlier response'}</p>}
        <p className="response-body">{comment.body}</p>
        <button className="text-control" disabled={busy} onClick={() => { change({ parent_id: comment.id }); input.current?.focus(); input.current?.scrollIntoView({ block: 'center', behavior: 'instant' }) }}>Reply</button>
      </li>
    })}</ol>
  </section>
}
