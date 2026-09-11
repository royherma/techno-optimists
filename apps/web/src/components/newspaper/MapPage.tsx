import { useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import WorldPlate from '../WorldPlate'
import { useFeed } from './useFeed'
import { stageColor } from '../../lib/vocab'
export default function MapPage({ initial }: { initial: Challenge[] }) {
  const { challenges } = useFeed(initial)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const placed = challenges.filter(c => c.lat != null && c.lng != null && `${c.title} ${c.location}`.toLowerCase().includes(query.toLowerCase()))
  const current = Math.min(page, Math.max(0, placed.length - 1)), c = placed[current]
  return <div className="np-map-page"><div className="np-front-tools"><h1>Around the world</h1><input type="search" aria-label="Search places" placeholder="Search places" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></div><div className="np-map-plate"><WorldPlate pins={placed.map(item => ({ lat: item.lat!, lng: item.lng!, r: item.id === c?.id ? 9 : 5, color: stageColor(item.stage), href: '/v2/c/' + item.slug, label: item.title }))} /></div><div className="np-map-story">{c ? <><p className="np-story-meta">{c.location} · {c.type}</p><h2><a href={'/v2/c/' + c.slug}>{c.title}</a></h2><a className="np-arrow-link" href={'/v2/c/' + c.slug}>Explore this Challenge →</a></> : <p>No matching Challenges have a location yet.</p>}</div><footer className="np-page-controls"><span>{placed.length} placed · {challenges.filter(c => c.lat == null || c.lng == null).length} without coordinates</span><div><button disabled={current === 0} onClick={() => setPage(current - 1)}>← Previous place</button><button disabled={current + 1 >= placed.length} onClick={() => setPage(current + 1)}>Next place →</button></div></footer></div>
}
