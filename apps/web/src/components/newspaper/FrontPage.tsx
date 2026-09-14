import { useEffect, useRef, useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import { useFeed } from './useFeed'
import StoryTile from './StoryTile'
import StoryRow from './StoryRow'
import './loading.css'

/**
 * List view is a reading preference, not a filter, so it lives in the URL and in
 * localStorage: the URL makes a list-view link shareable, localStorage makes the
 * choice survive a visit to a thread and back.
 */
type View = 'grid' | 'list'
const VIEW_KEY = 'np-front-view'
function storedView(): View | null {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : null } catch { return null }
}
function readView(): View {
  const param = new URLSearchParams(location.search).get('view')
  if (param === 'list' || param === 'grid') return param
  return storedView() || 'grid'
}

export default function FrontPage({ initial }: { initial: Challenge[] }) {
  const { challenges, error, loading } = useFeed(initial)
  const [type, setType] = useState('all')
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(1)
  const [rowSize, setRowSize] = useState(8)
  const [measured, setMeasured] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const resize = () => {
      const box = frame.current!
      setSize(box.clientWidth >= 980 && box.clientHeight >= 580 ? 5 : box.clientWidth >= 680 && box.clientHeight >= 440 ? 3 : 1)
      // 46px is one row plus its rule; the tools bar and page controls take the rest.
      setRowSize(Math.max(3, Math.floor((box.clientHeight - 96) / 46)))
      setPage(0); setMeasured(true)
    }
    const observer = new ResizeObserver(resize); observer.observe(frame.current!)
    const sync = () => { setType(new URLSearchParams(location.search).get('type') || 'all'); setView(readView()); setPage(0) }
    resize(); sync(); window.addEventListener('resize', resize); window.addEventListener('popstate', sync)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('popstate', sync) }
  }, [])
  function chooseView(next: View) {
    setView(next); setPage(0)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private mode: the URL still carries it */ }
    const url = new URL(location.href)
    if (next === 'grid') url.searchParams.delete('view'); else url.searchParams.set('view', next)
    history.replaceState(history.state, '', url)
  }
  const filtered = challenges.filter(c => (type === 'all' || c.type === type) && `${c.title} ${c.summary} ${c.location || ''}`.toLowerCase().includes(query.toLowerCase()))
  const perPage = view === 'list' ? rowSize : size
  const pages = Math.max(1, Math.ceil(filtered.length / perPage)), current = Math.min(page, pages - 1)
  const stories = filtered.slice(current * perPage, (current + 1) * perPage)
  const pending = !measured || loading
  const empty = <div className="np-empty"><h2>{query || type !== 'all' ? 'A different angle, perhaps?' : 'What could be better?'}</h2><p>{query || type !== 'all' ? 'No threads match your search. Try another search or return to all threads.' : 'A real problem. An unfinished idea. Something worth figuring out together.'}</p><a href="/">All threads →</a><a href="/post">Share a thread →</a></div>
  return <div className="np-front" ref={frame}>
    <div className="np-front-tools"><h1>{type === 'all' ? 'Explore threads' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}</h1>
      <div className="np-front-controls">
        <label><img src="/icons/magnifying-glass.svg" alt="" /><input type="search" placeholder="Search threads" aria-label="Search threads" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label>
        <div className="np-view-toggle" role="group" aria-label="Feed layout">
          <button type="button" aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>Edition</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>List</button>
        </div>
      </div>
    </div>
    {view === 'list'
      ? <div className={`np-news-list ${pending ? '' : 'np-edition-ready'}`} aria-busy={pending}>
          {pending ? Array.from({ length: 8 }, (_, i) => <div key={i} className="np-row np-skeleton" aria-hidden="true">
            <span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><div className="np-skeleton-headline"><i /></div><span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><span className="np-skeleton-meta" />
          </div>) : <>
            <header className="np-row np-row-head" aria-hidden="true"><span>Type</span><span>Stage</span><span>Thread</span><span>Place</span><span>Added</span><span>Prize</span><span>Signals</span></header>
            {stories.map(c => <StoryRow key={c.id} challenge={c} />)}
            {!stories.length && empty}
          </>}
        </div>
      : <div className={`np-news-grid ${pending ? '' : `np-news-count-${stories.length}`} ${pending ? 'np-loading-grid' : 'np-edition-ready'}`} aria-busy={pending}>
          {pending ? Array.from({ length: 5 }, (_, i) => <div key={i} className={`np-story np-skeleton ${i === 0 ? 'np-lead' : ''}`} aria-hidden="true">
            <div className="np-story-image np-skeleton-image" />
            <div className="np-story-copy"><div className="np-skeleton-meta" /><div className="np-skeleton-headline"><i /><i /><i /></div><div className="np-skeleton-lines"><i /><i /><i /></div><footer><span className="np-skeleton-meta" /></footer></div>
          </div>) : <>
            {stories.map((c, i) => <StoryTile key={c.id} challenge={c} lead={i === 0} brief={false} />)}
            {!stories.length && empty}
          </>}
        </div>}
    <footer className="np-page-controls"><span aria-live="polite">{pending ? 'Setting the edition…' : error ? (challenges.length ? 'Live refresh unavailable · showing saved threads' : 'Threads unavailable · please reload') : `${filtered.length ? current * perPage + 1 : 0}–${Math.min((current + 1) * perPage, filtered.length)} of ${filtered.length} threads`}</span><div><button disabled={pending || current === 0} onClick={() => setPage(current - 1)}>← Previous</button><button disabled={pending || current + 1 >= pages} onClick={() => setPage(current + 1)}>More threads →</button></div></footer>
  </div>
}
