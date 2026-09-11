import { useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import WorldPlate from '../WorldPlate'
import { useFeed } from './useFeed'
import { stageColor, STAGE_STAMP, TYPE_LABEL } from '../../lib/vocab'

export default function MapPage({ initial }: { initial: Challenge[] }) {
  const { challenges } = useFeed(initial)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const placed = challenges.filter(c => c.lat != null && c.lng != null && `${c.title} ${c.location}`.toLowerCase().includes(query.toLowerCase()))
  const current = Math.min(page, Math.max(0, placed.length - 1)), c = placed[current]
  const media = c?.media.find(m => m.kind === 'image')
  return <div className="np-map-page">
    <div className="np-front-tools"><h1>Around the world</h1><input type="search" aria-label="Search places" placeholder="Search places" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></div>
    <p className="np-map-hint">Hover, focus or tap a place to preview its Challenge below.</p>
    <div className="np-map-plate"><WorldPlate selectedIndex={current} onPreview={setPage} pins={placed.map(item => ({
      lat: item.lat!, lng: item.lng!, r: item.id === c?.id ? 9 : 5,
      color: stageColor(item.stage), label: `${item.location}: ${item.title}`,
    }))} /></div>
    <article className="np-map-story" aria-label="Selected Challenge">
      {c ? <>
        {media && <a className="np-map-image" href={'/v2/c/' + c.slug} tabIndex={-1} aria-hidden="true"><img src={media.url} alt="" /></a>}
        <div className="np-map-copy">
          <p className="np-story-meta">{c.location} · {TYPE_LABEL[c.type]} · {STAGE_STAMP[c.stage]}</p>
          <h2><a href={'/v2/c/' + c.slug}>{c.title}</a></h2>
          <p className="np-map-summary">{c.summary}</p>
          <a className="np-arrow-link" href={'/v2/c/' + c.slug}>Explore this Challenge →</a>
        </div>
      </> : <p>No matching Challenges have a location yet.</p>}
    </article>
    <footer className="np-page-controls"><span>{placed.length ? `Place ${current + 1} of ${placed.length}` : '0 places'} · {challenges.filter(c => c.lat == null || c.lng == null).length} without coordinates</span><div><button disabled={current === 0} onClick={() => setPage(current - 1)}>← Previous place</button><button disabled={current + 1 >= placed.length} onClick={() => setPage(current + 1)}>Next place →</button></div></footer>
  </div>
}
