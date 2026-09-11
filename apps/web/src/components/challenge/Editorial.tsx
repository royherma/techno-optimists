import { useRef, useState } from 'react'
import type { Challenge } from '../../../../../packages/types/index'

export default function Editorial({ challenge: c, refresh }: { challenge: Challenge; refresh: () => Promise<void> }) {
  const [emoji, setEmoji] = useState(c.emoji ?? '')
  const [title, setTitle] = useState(c.title)
  const [summary, setSummary] = useState(c.summary)
  const [body, setBody] = useState(c.body ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('')
    try {
      const r = await fetch(`/api/challenges/${c.slug}/editorial`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ emoji, title, summary, body }) })
      if (!r.ok) throw new Error(r.status === 400 ? 'Use one emoji and check the text lengths.' : 'Changes did not save. Check your admin session and try again.')
      await refresh(); setMessage('Changes saved.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Changes did not save.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <details className="editorial-tools detail-panel"><summary>Edit thread <span>Admin</span></summary>
    <form className="compact-form" onSubmit={save}>
      <label>Emoji <span className="composer-note">(optional)</span><input value={emoji} maxLength={32} disabled={busy} onChange={(e) => setEmoji(e.target.value)} aria-describedby="emoji-help" /></label>
      <p id="emoji-help" className="composer-note">One emoji beside the title. Leave empty to remove it.</p>
      <label>Title<input required minLength={8} maxLength={180} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Summary<textarea required minLength={10} maxLength={500} rows={3} value={summary} disabled={busy} onChange={(e) => setSummary(e.target.value)} /></label>
      <label>Context<textarea maxLength={20000} rows={7} value={body} disabled={busy} onChange={(e) => setBody(e.target.value)} /></label>
      <button className="primary-control" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>
}
