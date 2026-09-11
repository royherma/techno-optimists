import { formatDateTime, dateISO } from '../../lib/dates'
import { useEffect, useRef, useState } from 'react'
import type { ChallengeComment, CommentKind } from '../../../../../packages/types/index'
import type { Me } from '../../lib/session'
import ResponseContent, { isDiscussionMedia } from './ResponseContent'
import { ago } from '../../lib/vocab'
import { uuid } from '../../lib/uuid'

const LABEL: Record<CommentKind, string> = { comment: 'Comment', idea: 'Idea', question: 'Question', evidence: 'Evidence', test_result: 'Test result' }
type Attachment = { url: string; name: string }
type Draft = { attachments?: Attachment[]; body: string; kind: CommentKind; parent_id: string | null; request_id: string }
const emptyDraft = (): Draft => ({ body: '', kind: 'comment', parent_id: null, request_id: uuid() })

export default function Discussion({ slug, me, sessionReady }: { slug: string; me: Me | null; sessionReady: boolean }) {
  const [comments, setComments] = useState<ChallengeComment[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ body: '', kind: 'comment', parent_id: null, request_id: '' })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadFailed, setUploadFailed] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const [preview, setPreview] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const filesInput = useRef<HTMLInputElement>(null)
  const uploadLock = useRef(false)
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
      if (saved && typeof saved.body === 'string' && saved.kind in LABEL && typeof saved.request_id === 'string') restored = { ...saved, attachments: Array.isArray(saved.attachments) ? saved.attachments.filter((a: Attachment) => typeof a?.url === 'string' && isDiscussionMedia(a.url) && typeof a.name === 'string').slice(0, 4) : [] }
    } catch { /* Storage may be disabled. Writing still works. */ }
    setDraft(restored)
    setReady(true)
    void load()
    const focusIdea = () => {
      setPreview(false)
      setDraft((d) => ({ ...d, kind: 'idea', parent_id: null, request_id: uuid() }))
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
    setDraft((d) => ({ ...d, ...values, request_id: uuid() }))
    setStatus('')
  }

  const attachments = draft.attachments ?? []
  const serialized = [draft.body, ...attachments.map((a) => `![${a.name.replace(/[\[\]\\\n\r]/g, '')}](${a.url})`)].filter(Boolean).join('\n\n')
  const mediaCount = (serialized.match(/!\[/g) ?? []).length
  const canPublish = !!serialized.trim() && serialized.length <= 5000 && mediaCount <= 4 && !uploading && !uploadFailed

  function insert(before: string, after = '', fallback = '') {
    const start = input.current?.selectionStart ?? draft.body.length
    const end = input.current?.selectionEnd ?? start
    const selected = draft.body.slice(start, end) || fallback
    change({ body: draft.body.slice(0, start) + before + selected + after + draft.body.slice(end) })
    setPreview(false)
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + before.length, start + before.length + selected.length) })
  }

  async function addFiles(files: File[]) {
    if (!files.length || uploadLock.current || busy || !ready) return
    if (!me) { setUploadError('Sign in before attaching files. Your written draft stays in this tab.'); return }
    if (files.length + mediaCount > 4) { setUploadError('Attach up to 4 files per response.'); return }
    if (files.some((f) => !/^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm))$/.test(f.type) || !f.size || f.size > 100 * 1024 * 1024)) {
      setUploadError('Choose JPG, PNG, WebP, HEIC, MP4, MOV or WebM files, up to 100 MB each.'); return
    }
    uploadLock.current = true; setUploading(true); setUploadError(''); setUploadFailed(false)
    // Sequential uploads avoid buffering several large videos at once.
    for (const file of files) {
      try {
        const r = await fetch('/api/uploads', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': file.type }, body: file })
        if (!r.ok) throw new Error(r.status === 401 ? 'Your session expired. Sign in again before attaching files.' : `Could not upload ${file.name}. Choose the file again to retry.`)
        const { media } = await r.json()
        setDraft((d) => ({ ...d, attachments: [...(d.attachments ?? []), { url: media.url, name: file.name.slice(0, 120) }], request_id: uuid() }))
      } catch (e) { setUploadFailed(true); setUploadError(e instanceof Error ? e.message : 'Upload failed. Choose the file again to retry.'); break }
    }
    uploadLock.current = false; setUploading(false)
  }

  function addLink() {
    try {
      const url = new URL(linkUrl)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error()
      const start = input.current?.selectionStart ?? draft.body.length
      const end = input.current?.selectionEnd ?? start
      const label = (linkLabel.trim() || draft.body.slice(start, end) || url.hostname).replace(/[\[\]\\]/g, '')
      const markdown = `[${label}](${url.href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
      const prefix = draft.body.slice(0, start), suffix = draft.body.slice(end)
      change({ body: prefix + (prefix && !/\s$/.test(prefix) ? ' ' : '') + markdown + (suffix && !/^\s/.test(suffix) ? ' ' : '') + suffix })
      setPreview(false)
      requestAnimationFrame(() => input.current?.focus())
      setLinkOpen(false); setLinkUrl(''); setLinkLabel(''); setUploadError('')
    } catch { setUploadError('Enter a complete link starting with https:// or http://.'); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready || inFlight.current || !canPublish || !sessionReady) return
    if (!me) { window.location.href = `/signin?next=${encodeURIComponent(`/c/${slug}#discussion`)}`; return }
    inFlight.current = true
    setBusy(true); setError(''); setStatus('')
    try {
      const r = await fetch(`/api/challenges/${slug}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ body: serialized, kind: draft.kind, parent_id: draft.parent_id, request_id: draft.request_id }),
      })
      if (r.status === 401) { window.location.href = `/signin?next=${encodeURIComponent(`/c/${slug}#discussion`)}`; return }
      if (!r.ok) throw new Error(r.status === 429 ? 'A few too quickly. Wait a minute, then try again.' : 'Your response did not save. Your draft is still here; try again.')
      setDraft(emptyDraft()); setPreview(false)
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
    <form className="discussion-composer" onSubmit={submit} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={(e) => {
      if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)) }
    }}>
      <label htmlFor="response-body">{draft.parent_id ? `Reply${parent ? ` to @${parent.author.handle}` : ''}` : 'Your response'}</label>
      {draft.parent_id && <button className="text-control" type="button" disabled={busy} onClick={() => change({ parent_id: null })}>Cancel reply</button>}
      <div className="composer-tools" aria-label="Response tools">
        <button type="button" disabled={busy || uploading || !sessionReady} onClick={() => { if (!me) setUploadError('Sign in before attaching files. Your written draft stays in this tab.'); else filesInput.current?.click() }}>＋ Add images or video</button>
        <button type="button" disabled={busy} aria-expanded={linkOpen} onClick={() => setLinkOpen(!linkOpen)}>Add link</button>
        <button type="button" disabled={busy} aria-expanded={formatting} onClick={() => setFormatting(!formatting)}>Formatting</button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Write' : 'Preview'}</button>
      </div>
      <input ref={filesInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      {linkOpen && <div className="composer-link">
        <label>Link URL<input type="url" disabled={busy} value={linkUrl} placeholder="https://" onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} /></label>
        <label>Link text (optional)<input disabled={busy} value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} /></label>
        <button type="button" disabled={busy} onClick={addLink}>Insert link</button>
      </div>}
      {formatting && <div className="composer-tools" aria-label="Text formatting">
        <button type="button" disabled={busy} onClick={() => insert('**', '**', 'bold text')}><strong>Bold</strong></button>
        <button type="button" disabled={busy} onClick={() => insert('*', '*', 'italic text')}><em>Italic</em></button>
        <button type="button" disabled={busy} onClick={() => insert('\n- ', '', 'List item')}>List</button>
        <button type="button" disabled={busy} onClick={() => insert('\n> ', '', 'Quoted text')}>Quote</button>
        <button type="button" disabled={busy} onClick={() => insert('`', '`', 'code')}>Code</button>
      </div>}
      {preview && <div className="composer-preview" aria-label="Response preview">{serialized.trim() ? <ResponseContent body={serialized} /> : <p>Your response preview will appear here.</p>}</div>}
      <textarea hidden={preview} ref={input} id="response-body" maxLength={5000} rows={4} value={draft.body} disabled={busy}
        placeholder="What would you try? What are we missing?" required={!attachments.length && !preview} onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void addFiles(files) } }} onChange={(e) => change({ body: e.target.value })} />
      <p className="composer-note">Drop or paste images here. Up to 4 files, 100 MB each. Video links work too.</p>
      {uploading && <p role="status" className="composer-note">Uploading files... You can keep writing.</p>}
      {uploadError && <p role="alert" className="form-error">{uploadError} {uploadFailed && <button type="button" className="text-control" onClick={() => { setUploadFailed(false); setUploadError('') }}>Continue without this file</button>} {!me && <a href={`/signin?next=${encodeURIComponent(`/c/${slug}#discussion`)}`}>Sign in</a>}</p>}
      {!!attachments.length && <ul className="composer-attachments">{attachments.map((a, index) => <li key={a.url}>
        <ResponseContent body={`![${a.name.replace(/[\[\]\\]/g, '')}](${a.url})`} />
        <label>Description<input value={a.name} maxLength={120} disabled={busy} onChange={(e) => change({ attachments: attachments.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /></label>
        <button className="text-control" type="button" disabled={busy || uploading} onClick={() => change({ attachments: attachments.filter((_, i) => i !== index) })}>Remove attachment {index + 1}</button>
      </li>)}</ul>}
      {mediaCount > 4 && <p className="form-error" role="alert">Attach up to 4 files per response.</p>}
      {serialized.length > 5000 && <p className="form-error" role="alert">Your response is too long. Shorten it by {serialized.length - 5000} characters.</p>}
      <div className="composer-footer">
        <label className="kind-label">Label <span>(optional)</span>
          <select value={draft.kind} disabled={busy} onChange={(e) => change({ kind: e.target.value as CommentKind })}>
            {Object.entries(LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
        <button className="primary-control" disabled={busy || !ready || !sessionReady || !canPublish}>{busy ? 'Publishing…' : me ? 'Publish response' : 'Sign in to respond'}</button>
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
        <ResponseContent body={comment.body} />
        <button className="text-control" disabled={busy} onClick={() => { setPreview(false); change({ parent_id: comment.id }); input.current?.focus(); input.current?.scrollIntoView({ block: 'center', behavior: 'instant' }) }}>Reply</button>
      </li>
    })}</ol>
  </section>
}
