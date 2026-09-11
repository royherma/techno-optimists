import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Challenge, Update } from '../../../../../packages/types'
import type { DetailPerson } from '../../lib/api'
import { getMe, type Me } from '../../lib/session'
import { STAGE_MEANING, STAGE_STAMP } from '../../lib/vocab'
import { formatDate } from '../../lib/dates'
import PagedContent from './PagedContent'
import StageBadge from './StageBadge'
import SourcePlace from './SourcePlace'
import PanelDialog from './PanelDialog'
import ViewsCount from './ViewsCount'
import ActionBar from '../ActionBar'
import Discussion from '../challenge/Discussion'
import Progress from '../challenge/Progress'
import PeopleLive from '../PeopleLive'
import Editorial from '../challenge/Editorial'
import '../../styles/newspaper/challenge.css'

export type ChallengeData = { challenge: Challenge; updates: Update[]; people: DetailPerson[] }
function Panel({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  return <section className={`np-panel np-panel-${name}`} aria-label={title}>
    <header className="np-panel-heading"><h2>{title}</h2></header>
    <PagedContent compact label={title}>{children}</PagedContent>
  </section>
}
export default function ChallengePage({ initial }: { initial?: ChallengeData }) {
  const [data, setData] = useState(initial)
  const [me, setMe] = useState<Me | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState('')
  const [media, setMedia] = useState(0)
  const [editing, setEditing] = useState(false)
  async function refresh() {
    const slug = location.pathname.split('/').filter(Boolean).at(-1)!
    const response = await fetch(`/api/challenges/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('The latest Challenge could not load. Try again.')
    const next: ChallengeData = await response.json()
    setData(previous => previous?.challenge.slug === next.challenge.slug
      ? { ...next, challenge: { ...next.challenge, views_count: Math.max(previous.challenge.views_count, next.challenge.views_count) } }
      : next); setError(''); document.title = next.challenge.title + ' - Techno Optimists'
  }
  useEffect(() => {
    void refresh().catch(e => setError(e.message))
    void getMe().then(person => { setMe(person); setSessionReady(true) })
  }, [])
  // One POST per Challenge per mount. The ref guards React's double-invoke in
  // development and a refresh() that re-renders with the same slug; the server
  // dedupes the rest, so a repeat visit is a no-op insert.
  const viewed = useRef('')
  useEffect(() => {
    const slug = data?.challenge.slug
    if (!slug || viewed.current === slug) return
    viewed.current = slug
    void fetch(`/api/challenges/${encodeURIComponent(slug)}/view`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
    }).then(async response => {
      if (!response.ok) return
      const { views_count } = await response.json() as { views_count: number }
      setData(previous => previous?.challenge.slug === slug
        ? { ...previous, challenge: { ...previous.challenge, views_count: Math.max(previous.challenge.views_count, views_count) } }
        : previous)
    }).catch(() => {})
  }, [data?.challenge.slug])
  if (!data) return <div className="np-empty"><h1>{error || 'Opening the Challenge…'}</h1>{error && <button onClick={() => void refresh().catch(e => setError(e.message))}>Try again</button>}</div>
  const c = data.challenge, image = c.media[Math.min(media, c.media.length - 1)]
  return <div className="np-challenge np-challenge-sheet" data-stage={c.stage}>
    <div className="np-challenge-kicker"><a href="/">← All Challenges</a><span className={`type-${c.type}`}>{c.type} <span> / {c.location || 'Around the world'}</span></span><StageBadge stage={c.stage} /><span className="np-relative">Impact not specified</span>{me?.is_admin && <button onClick={() => setEditing(true)}>Edit Challenge</button>}</div>
    {error && <p className="np-error" role="alert">{error} <button onClick={() => void refresh().catch(e => setError(e.message))}>Retry</button></p>}
    <div className="np-panel-grid">
      <section className="np-panel np-panel-story" aria-label="Challenge story">
        <div className="np-story-plate">
          {image?.kind === 'video' ? <video src={image.url} controls playsInline /> : image ? <img src={image.url} alt={image.alt || ''} /> : <p>Things can be better.</p>}
          {c.media.length > 1 && <div className="np-media-controls"><button aria-label="Previous image" disabled={media === 0} onClick={() => setMedia(media - 1)}>←</button><span>{media + 1} / {c.media.length}</span><button aria-label="Next image" disabled={media + 1 >= c.media.length} onClick={() => setMedia(media + 1)}>→</button></div>}
        </div>
        <div className="np-story-reading"><PagedContent compact label="Story"><h1>{c.title}</h1><p className="np-deck">{c.summary}</p><p className="np-story-author">Shared by <a href={'/people?handle=' + encodeURIComponent(c.author.handle)}>@{c.author.handle}</a> · {formatDate(c.imported_at || c.created_at)} <ViewsCount count={c.views_count ?? 0} title={c.title} /></p>{c.body && c.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</PagedContent></div>
      </section>
      <Panel name="help" title="How you can help"><ActionBar slug={c.slug} type={c.type} actions={c.actions} /></Panel>
      <Panel name="discussion" title="Discussion"><Discussion panel slug={c.slug} me={me} sessionReady={sessionReady} /></Panel>
      <Panel name="progress" title="Progress"><p className="np-current-stage"><span className={`np-stage-color stage-${c.stage}`} /> <strong>{STAGE_STAMP[c.stage]}</strong> · {STAGE_MEANING[c.stage]}</p><Progress panel challenge={c} updates={data.updates} me={me} refresh={refresh} /></Panel>
      <Panel name="people" title="People"><PeopleLive slug={c.slug} initial={data.people} /></Panel>
      <SourcePlace challenge={c} />
    </div>
    {me?.is_admin && <PanelDialog title="Edit Challenge" open={editing} onClose={() => setEditing(false)}><Editorial challenge={c} refresh={refresh} /></PanelDialog>}
  </div>
}
