import { useEffect, useState } from 'react'
import type { Challenge } from '../../../../packages/types'
import { STAGES } from '../../../../packages/types'
export default function EditorialFeed({ initial }: { initial: Challenge[] }) {
  const [items, setItems] = useState(initial)
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(5)
  const [error, setError] = useState(false)
  useEffect(() => {
    const resize = () => { setSize(window.innerWidth < 700 || window.innerHeight < 600 ? 1 : window.innerWidth < 1100 || window.innerHeight < 800 ? 3 : 5); setPage(0) }
    resize(); window.addEventListener('resize', resize)
    const controller = new AbortController()
    async function refresh() {
      try {
        let cursor: string | null = null
        const all: Challenge[] = []
        do {
          const r: Response = await fetch('/api/challenges?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal: controller.signal })
          if (!r.ok) throw new Error('feed')
          const data: { challenges: Challenge[]; next_cursor: string | null } = await r.json(); all.push(...data.challenges); cursor = data.next_cursor
        } while (cursor)
        setItems(all); setError(false)
      } catch { if (!controller.signal.aborted) setError(true) }
    }
    refresh()
    return () => { controller.abort(); window.removeEventListener('resize', resize) }
  }, [])
  const filtered = items.filter(c => (type === 'all' || c.type === type) && `${c.title} ${c.summary} ${c.location || ''}`.toLowerCase().includes(query.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * size, (current + 1) * size)
  return <div className="edition">
    <header className="edition-masthead"><p>A brighter<br />tomorrow<br />builds today</p><div><a href="/v2" className="edition-brand">TechnoOptimists.org</a><p>People · Ideas · Technology · A better today</p></div><blockquote>Explore.<br />Solve.<br />Build together.</blockquote></header>
    <nav className="edition-nav" aria-label="Main navigation"><a href="/v2" aria-current="page">Front page</a><a href="/map">World map</a><a href="/people">People</a><a href="/">Classic view</a><a href="/settings">Account</a><a className="edition-submit" href="/post">+ Share a Challenge</a></nav>
    <div className="edition-tools"><div role="group" aria-label="Challenge type">{['all','problem','idea','experiment','build'].map(t => <button key={t} aria-pressed={type === t} onClick={() => { setType(t); setPage(0) }}>{t === 'all' ? 'All Challenges' : t === 'build' ? 'Builds' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}</button>)}</div><input aria-label="Search Challenges" type="search" placeholder="Search Challenges" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></div>
    <div className="edition-body">
      <main className={'edition-stories count-' + visible.length} aria-label="Latest Challenges">
        {visible.map((c, i) => <article className={i === 0 ? 'edition-story lead' : 'edition-story'} key={c.id}>
          {c.media[0]?.kind === 'image' && <a className="edition-image" href={'/c/' + c.slug}><img src={c.media[0].url} alt={c.media[0].alt || ''} /></a>}
          <div className="edition-copy"><p className="edition-meta"><strong>{c.type}</strong><span>{c.location || 'Around the world'}</span></p><h1 hidden={i !== 0}><a href={'/c/' + c.slug}>{c.title}</a></h1>{i !== 0 && <h2><a href={'/c/' + c.slug}>{c.title}</a></h2>}<p className="edition-summary">{c.summary}</p><div className="edition-story-footer"><span>Stage: {c.stage}</span><a href={'/c/' + c.slug}>Read more →</a></div></div>
        </article>)}
        {!visible.length && <div className="edition-empty"><h1>{query || type !== 'all' ? 'No matching Challenges' : 'What could be better?'}</h1><p>{query || type !== 'all' ? 'Try a different search or Challenge type.' : 'Real problems. Fresh ideas. Something worth figuring out together.'}</p><a href="/post">Share a Challenge →</a></div>}
      </main>
      <aside className="edition-aside"><section><h2>Progress at a glance</h2><p>Challenges by current stage</p>{STAGES.map(stage => { const count = items.filter(c => c.stage === stage).length; return <div className="edition-stage" key={stage}><span>{stage}</span><meter min="0" max={Math.max(1, items.length)} value={count} aria-label={stage} /><b>{count}</b></div> })}</section><section><h2>Around the world</h2><p>Local problems. Global brains.</p><a href="/map">Explore the map →</a></section><blockquote>“Small ideas, shared widely, can change the world.”</blockquote><a href="/post" className="edition-invite">See something that could be better?<br /><strong>Bring it here →</strong></a></aside>
    </div>
    <footer className="edition-pagination"><span aria-live="polite">{error ? 'Live refresh unavailable. Showing saved edition.' : `${filtered.length} Challenges · Page ${current + 1} of ${pages}`}</span><div><button disabled={current === 0} onClick={() => setPage(current - 1)}>← Previous</button><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next page →</button></div></footer>
  </div>
}
