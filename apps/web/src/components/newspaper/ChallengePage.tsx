import { useEffect, useState } from 'react'
import type { Challenge, Update } from '../../../../../packages/types'
import type { DetailPerson } from '../../lib/api'
import { getMe, type Me } from '../../lib/session'
import { STAGE_MEANING, STAGE_STAMP } from '../../lib/vocab'
import { formatDate } from '../../lib/dates'
import PagedContent from './PagedContent'
import { Rings } from './Legend'
import ActionBar from '../ActionBar'
import Discussion from '../challenge/Discussion'
import Progress from '../challenge/Progress'
import PeopleLive from '../PeopleLive'
import Editorial from '../challenge/Editorial'
import WorldPlate from '../WorldPlate'

export type ChallengeData = { challenge: Challenge; updates: Update[]; people: DetailPerson[] }
const panels = ['Story', 'Context', 'Discussion', 'Progress', 'People', 'Participate', 'Source']
export default function ChallengePage({ initial, rings = 1 }: { initial?: ChallengeData; rings?: number }) {
  const [data, setData] = useState(initial)
  const [me, setMe] = useState<Me | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState('Story')
  const [media, setMedia] = useState(0)
  async function refresh() {
    const slug = location.pathname.split('/').filter(Boolean).at(-1)!
    const response = await fetch(`/api/challenges/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('The latest Challenge could not load. Try again.')
    const next: ChallengeData = await response.json(); setData(next); setError(''); document.title = next.challenge.title + ' - Techno Optimists'
  }
  function select(panel: string) { setActive(panel); history.pushState(null, '', '#' + panel.toLowerCase()) }
  useEffect(() => {
    const sync = () => {
      const hash = location.hash.slice(1)
      setActive(hash.startsWith('response-') ? 'Discussion' : panels.find(p => p.toLowerCase() === hash) || 'Story')
    }
    const idea = () => { select('Discussion') }
    sync(); void refresh().catch(e => setError(e.message)); void getMe().then(person => { setMe(person); setSessionReady(true) })
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync); window.addEventListener('compose-idea', idea)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); window.removeEventListener('compose-idea', idea) }
  }, [])
  if (!data) return <div className="np-empty"><h1>{error || 'Opening the Challenge…'}</h1>{error && <button onClick={() => void refresh().catch(e => setError(e.message))}>Try again</button>}</div>
  const c = data.challenge, image = c.media[Math.min(media, c.media.length - 1)]
  let source: URL | null = null
  try { const url = new URL(c.source?.url || ''); if (['http:', 'https:'].includes(url.protocol)) source = url } catch { /* May be an interview, not a URL. */ }
  return <div className="np-challenge">
    <div className="np-challenge-kicker"><a href="/v2">← The edition</a><span className={`type-${c.type}`}>{c.type} <span> / {c.location || 'Around the world'}</span></span><span className="np-relative" title="Relative contributions in this edition"><Rings count={rings} size={24} />Level {rings}</span></div>
    <nav className="np-section-tabs" aria-label="Challenge sections">{panels.map(panel => <button key={panel} aria-pressed={active === panel} onClick={() => select(panel)}>{panel}</button>)}{me?.is_admin && <button aria-pressed={active === 'Edit'} onClick={() => select('Edit')}>Edit</button>}</nav>
    {error && <p className="np-error" role="alert">{error} <button onClick={() => void refresh().catch(e => setError(e.message))}>Retry</button></p>}
    <div className="np-challenge-panels">
      <section hidden={active !== 'Story'} className="np-overview" aria-label="Challenge story">
        <div className="np-cover"><div className="np-cover-image">{image?.kind === 'video' ? <video src={image.url} controls playsInline /> : image ? <img src={image.url} alt={image.alt || ''} /> : <div className="np-text-art">Things can<br />be better.</div>}</div><div className="np-cover-caption"><span>{c.location || 'A Challenge worth exploring'}</span>{c.media.length > 1 && <div><button disabled={media === 0} onClick={() => setMedia(media - 1)}>←</button><span>{media + 1} / {c.media.length}</span><button disabled={media + 1 >= c.media.length} onClick={() => setMedia(media + 1)}>→</button></div>}</div></div>
        <div className="np-cover-story"><h1>{c.title}</h1><p className="np-deck">{c.summary}</p><p className="np-byline">Shared by <a href={'/v2/people?handle=' + encodeURIComponent(c.author.handle)}>@{c.author.handle}</a> · {formatDate(c.imported_at || c.created_at)}</p><div className="np-next-step"><span className={`np-stage-color stage-${c.stage}`} /><div><strong>{STAGE_STAMP[c.stage]}</strong><p>{STAGE_MEANING[c.stage]}. Your perspective could be the next step.</p></div></div><div className="np-cover-actions"><button onClick={() => select('Context')}>Read the full story →</button><button onClick={() => select('Discussion')}>Join the discussion →</button></div></div>
      </section>
      <section hidden={active !== 'Context'} className="np-full-panel"><PagedContent label="Full story"><h1>{c.title}</h1><p className="np-deck">{c.summary}</p>{(c.body || 'There is no additional context yet. Ask a question in the discussion.').split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</PagedContent></section>
      <section hidden={active !== 'Discussion'} className="np-full-panel"><PagedContent label="Discussion"><Discussion paged slug={c.slug} me={me} sessionReady={sessionReady} /></PagedContent></section>
      <section hidden={active !== 'Progress'} className="np-full-panel"><PagedContent label="Progress"><Progress challenge={c} updates={data.updates} me={me} refresh={refresh} /></PagedContent></section>
      <section hidden={active !== 'People'} className="np-full-panel"><PagedContent label="People"><PeopleLive slug={c.slug} initial={data.people} /></PagedContent></section>
      <section hidden={active !== 'Participate'} className="np-full-panel"><PagedContent label="Participate"><h1>A useful next step</h1><p>Have this problem, an idea, or experience to share? Choose what you can bring.</p><ActionBar slug={c.slug} type={c.type} actions={c.actions} /></PagedContent></section>
      <section hidden={active !== 'Source'} className="np-full-panel"><PagedContent label="Source & place"><h1>Behind the story</h1><h2>Where</h2><p>{c.location || 'No location provided.'}</p>{c.lat != null && c.lng != null && <WorldPlate pins={[{ lat:c.lat, lng:c.lng, r:8, color:'#ac342c' }]} />}<h2>Source</h2>{source ? <p><a href={source.href} target="_blank" rel="noopener noreferrer">{c.source?.name || source.hostname} ↗</a></p> : <p>{c.source?.name || c.source?.url || 'Shared directly on Techno Optimists.'}</p>}{c.source?.note && <p>{c.source.note}</p>}<p>Added here: {formatDate(c.imported_at || c.created_at)}.</p><p>Latest activity: {formatDate(c.last_activity_at)}.</p></PagedContent></section>
      {me?.is_admin && <section hidden={active !== 'Edit'} className="np-full-panel"><PagedContent label="Editorial"><Editorial challenge={c} refresh={refresh} /></PagedContent></section>}
    </div>
  </div>
}
