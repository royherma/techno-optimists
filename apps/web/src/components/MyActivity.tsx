import { useEffect, useState } from 'react'
import type { ActionKind, Media } from '../../../../packages/types/index'
import { ACTION_LABEL, STAGE_STAMP } from '../lib/vocab'

type Item = { slug: string; title: string; summary: string; stage: keyof typeof STAGE_STAMP; kinds: ActionKind[]; media: Media[]; location: string | null }

export default function MyActivity() {
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState<number | null>(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  async function load(pageNumber: number) {
    setBusy(true); setError(false)
    try {
      const r = await fetch(`/api/people/me/activity?page=${pageNumber}`, { cache: 'no-store' })
      if (r.status === 401) { setSignedOut(true); return }
      if (!r.ok) throw new Error('load')
      const d = await r.json()
      setItems((old) => pageNumber === 0 ? d.items : [...old, ...d.items])
      setPage(d.next_page)
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  useEffect(() => { void load(0) }, [])
  const shown = items.filter((item) => filter === 'all' || item.kinds.includes(filter as ActionKind))
  return <section className="my-activity" aria-labelledby="activity-title">
    <h2 id="activity-title">Your marked threads</h2>
    <p>Pick up where you left off. Your responses and followed threads live here.</p>
    {signedOut ? <a href="/signin?next=/settings%23activity">Sign in to see your threads</a> : <>
      {items.length > 0 && <label className="activity-filter">Show
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All responses</option>
          {Object.entries(ACTION_LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </label>}
      <p role="status">{busy ? 'Loading your threads...' : error ? 'Your threads could not load.' : `${shown.length} ${shown.length === 1 ? 'thread' : 'threads'}${page !== null ? ' loaded' : ''}`}</p>
      {error && <button type="button" onClick={() => void load(page ?? 0)}>Try again</button>}
      {!busy && !error && !items.length && <p>See something interesting? Choose a response or Follow progress on a thread, and find it here. <a href="/">Explore threads →</a></p>}
      {!busy && items.length > 0 && !shown.length && <p>No threads match this response. Choose another filter.</p>}
      <ul>{shown.map((item) => <li key={item.slug}>
        <a className="activity-item" href={`/c/${item.slug}#contribute`}>
          {item.media[0]?.kind === 'image' && <img src={item.media[0].url} alt="" loading="lazy" />}
          <span><small>{STAGE_STAMP[item.stage]}{item.location ? ` · ${item.location}` : ''}</small>
            <strong>{item.title}</strong>
            <span className="activity-responses">{item.kinds.map((kind) => <span key={kind}>✓ {ACTION_LABEL[kind]}</span>)}</span>
          </span>
        </a>
      </li>)}</ul>
      {page !== null && !busy && !error && items.length > 0 && <button type="button" onClick={() => void load(page)}>Load more</button>}
    </>}
  </section>
}
