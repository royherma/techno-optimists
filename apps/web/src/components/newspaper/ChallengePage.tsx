import { useEffect, useState, type ReactNode } from 'react'
import type { Challenge, Update } from '../../../../../packages/types'
import type { DetailPerson } from '../../lib/api'
import { getMe, type Me } from '../../lib/session'
import { STAGE_MEANING, STAGE_STAMP } from '../../lib/vocab'
import { formatDate } from '../../lib/dates'
import PagedContent from './PagedContent'
import PanelDialog from './PanelDialog'
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
    setData(next); setError(''); document.title = next.challenge.title + ' - Techno Optimists'
  }
  useEffect(() => {
    void refresh().catch(e => setError(e.message))
    void getMe().then(person => { setMe(person); setSessionReady(true) })
  }, [])
  if (!data) return <div className="np-empty"><h1>{error || 'Opening the Challenge…'}</h1>{error && <button onClick={() => void refresh().catch(e => setError(e.message))}>Try again</button>}</div>
  const c = data.challenge, image = c.media[Math.min(media, c.media.length - 1)]
  let source: URL | null = null
  try { const url = new URL(c.source?.url || ''); if (['http:', 'https:'].includes(url.protocol)) source = url } catch { /* A source may be an interview. */ }
  return <div className="np-challenge np-challenge-sheet">
    <div className="np-challenge-kicker"><a href="/v2">← All Challenges</a><span className={`type-${c.type}`}>{c.type} <span> / {c.location || 'Around the world'}</span></span><span className="np-relative">Impact not specified</span>{me?.is_admin && <button onClick={() => setEditing(true)}>Edit Challenge</button>}</div>
    {error && <p className="np-error" role="alert">{error} <button onClick={() => void refresh().catch(e => setError(e.message))}>Retry</button></p>}
    <div className="np-panel-grid">
      <section className="np-panel np-panel-story" aria-label="Challenge story">
        <div className="np-story-plate">
          {image?.kind === 'video' ? <video src={image.url} controls playsInline /> : image ? <img src={image.url} alt={image.alt || ''} /> : <p>Things can be better.</p>}
          {c.media.length > 1 && <div className="np-media-controls"><button aria-label="Previous image" disabled={media === 0} onClick={() => setMedia(media - 1)}>←</button><span>{media + 1} / {c.media.length}</span><button aria-label="Next image" disabled={media + 1 >= c.media.length} onClick={() => setMedia(media + 1)}>→</button></div>}
        </div>
        <div className="np-story-reading"><PagedContent compact label="Story"><h1>{c.title}</h1><p className="np-deck">{c.summary}</p><p className="np-story-author">Shared by <a href={'/v2/people?handle=' + encodeURIComponent(c.author.handle)}>@{c.author.handle}</a> · {formatDate(c.imported_at || c.created_at)}</p>{c.body && c.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</PagedContent></div>
      </section>
      <Panel name="help" title="How you can help"><ActionBar slug={c.slug} type={c.type} actions={c.actions} /></Panel>
      <Panel name="discussion" title="Discussion"><Discussion panel slug={c.slug} me={me} sessionReady={sessionReady} /></Panel>
      <Panel name="progress" title="Progress"><p className="np-current-stage"><span className={`np-stage-color stage-${c.stage}`} /> <strong>{STAGE_STAMP[c.stage]}</strong> · {STAGE_MEANING[c.stage]}</p><Progress panel challenge={c} updates={data.updates} me={me} refresh={refresh} /></Panel>
      <Panel name="people" title="People"><PeopleLive slug={c.slug} initial={data.people} /></Panel>
      <Panel name="source" title="Source & place"><p>{source ? <a href={source.href} target="_blank" rel="noopener noreferrer">{c.source?.name || source.hostname} ↗</a> : c.source?.name || c.source?.url || 'Shared directly here.'}</p><p>{c.location || 'No location provided.'}</p>{c.source?.note && <p>{c.source.note}</p>}<p>Added {formatDate(c.imported_at || c.created_at)}. Latest activity {formatDate(c.last_activity_at)}.</p></Panel>
    </div>
    {me?.is_admin && <PanelDialog title="Edit Challenge" open={editing} onClose={() => setEditing(false)}><Editorial challenge={c} refresh={refresh} /></PanelDialog>}
  </div>
}
