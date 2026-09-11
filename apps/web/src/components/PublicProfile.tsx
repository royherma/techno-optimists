import { formatDate, formatDateTime, dateISO } from '../lib/dates'
import { useEffect, useState } from 'react'
type Contribution = { id: string; kind: string; slug: string; title: string; body: string; created_at: string }
type Result = { person: { handle: string }; contributions: Contribution[]; next_offset: number | null }
export default function PublicProfile() {
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load(offset = 0) {
    setBusy(true); setError('')
    try {
      const handle = new URLSearchParams(location.search).get('handle') ?? ''
      if (!handle) throw new Error('Choose an author from a Challenge to see their contributions.')
      const r = await fetch(`/api/people/${encodeURIComponent(handle)}/contributions?offset=${offset}`)
      if (!r.ok) throw new Error(r.status === 404 ? 'This profile was not found.' : 'The profile could not load. Please retry.')
      const next = await r.json() as Result
      setData(old => offset && old ? { ...next, contributions: [...old.contributions, ...next.contributions] } : next)
      document.title = `@${next.person.handle} - Techno Optimists`
    } catch (e) { setError(e instanceof Error ? e.message : 'The profile could not load.') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [])
  return <div className="public-profile">
    <header><p className="profile-kicker">Public contributions</p><h1>{data ? `@${data.person.handle}` : 'Contributor'}</h1><p>A handle connects the work shared here. It does not identify the person behind it.</p></header>
    {error && <p role="alert">{error} <button onClick={() => void load(data?.next_offset ?? 0)}>Retry</button></p>}
    {data && <><h2>Shared work</h2>{data.contributions.length ? <ol>{data.contributions.map(item => <li key={`${item.kind}-${item.id}`}>
      <p className="profile-kicker">{item.kind === 'challenge' ? 'Shared a Challenge' : item.kind === 'update' ? 'Added a progress update' : 'Joined the discussion'} · <time dateTime={dateISO(item.created_at)} title={formatDateTime(item.created_at)}>{formatDate(item.created_at)}</time></p>
      <h3><a href={`/c/${encodeURIComponent(item.slug)}${item.kind === 'comment' ? `#response-${item.id}` : item.kind === 'update' ? '#progress' : ''}`}>{item.title}</a></h3><p className="contribution-excerpt">{item.body}</p>
    </li>)}</ol> : <p>No public contributions yet.</p>}{data.next_offset !== null && <button disabled={busy} onClick={() => void load(data.next_offset!)}>Load more</button>}</>}
    {busy && <p role="status">Loading contributions…</p>}
    <a href="/">Explore more Challenges →</a>
  </div>
}
