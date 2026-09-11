import { useEffect, useRef, useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import { useFeed } from './useFeed'
import StoryTile from './StoryTile'

export default function FrontPage({ initial }: { initial: Challenge[] }) {
  const { challenges, error } = useFeed(initial)
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(3)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const resize = () => { const box = frame.current!; setSize(box.clientWidth >= 980 && box.clientHeight >= 580 ? 5 : box.clientWidth >= 680 && box.clientHeight >= 440 ? 3 : 1); setPage(0) }
    const observer = new ResizeObserver(resize); observer.observe(frame.current!)
    const sync = () => { setType(new URLSearchParams(location.search).get('type') || 'all'); setPage(0) }
    resize(); sync(); window.addEventListener('resize', resize); window.addEventListener('popstate', sync)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('popstate', sync) }
  }, [])
  const filtered = challenges.filter(c => (type === 'all' || c.type === type) && `${c.title} ${c.summary} ${c.location || ''}`.toLowerCase().includes(query.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / size)), current = Math.min(page, pages - 1)
  const stories = filtered.slice(current * size, (current + 1) * size)
  return <div className="np-front" ref={frame}>
    <div className="np-front-tools"><h1>{type === 'all' ? 'Explore Challenges' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}</h1><label><img src="/icons/magnifying-glass.svg" alt="" /><input type="search" placeholder="Search Challenges" aria-label="Search Challenges" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label></div>
    <div className={`np-news-grid np-news-count-${stories.length}`}>
      {stories.map((c, i) => <StoryTile key={c.id} challenge={c} lead={i === 0} brief={false} />)}
      {!stories.length && <div className="np-empty"><h2>{query || type !== 'all' ? 'A different angle, perhaps?' : 'What could be better?'}</h2><p>{query || type !== 'all' ? 'No Challenges match your search. Try another search or return to all Challenges.' : 'A real problem. An unfinished idea. Something worth figuring out together.'}</p><a href="/">All Challenges →</a><a href="/post">Share a Challenge →</a></div>}
    </div>
    <footer className="np-page-controls"><span aria-live="polite">{error ? 'Live refresh unavailable · showing saved Challenges' : `${filtered.length ? current * size + 1 : 0}–${Math.min((current + 1) * size, filtered.length)} of ${filtered.length} Challenges`}</span><div><button disabled={current === 0} onClick={() => setPage(current - 1)}>← Previous</button><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>More Challenges →</button></div></footer>
  </div>
}
