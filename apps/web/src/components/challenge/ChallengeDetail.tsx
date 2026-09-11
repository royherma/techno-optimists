import { formatDate, formatDateTime, dateISO } from '../../lib/dates'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { Challenge, Update, Stage } from '../../../../../packages/types/index'
import type { DetailPerson } from '../../lib/api'
import { getMe, type Me } from '../../lib/session'
import { TYPE_LABEL, STAGE_ORDER, STAGE_STAMP, STAGE_MEANING, ago, gridRef } from '../../lib/vocab'
import ActionBar from '../ActionBar'
import PeopleLive from '../PeopleLive'
import Discussion from './Discussion'
import Progress from './Progress'
import Editorial from './Editorial'
import ChallengeLocation from './ChallengeLocation'

type Detail = { challenge: Challenge; updates: Update[]; people: DetailPerson[] }
function sourceLink(value: string | null | undefined) {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) ? url : null } catch { return null }
}
const PROMPT: Record<Stage, string> = {
  spot: 'What have you noticed? Help describe the Challenge.',
  understand: 'What causes this? Share what you know or ask a useful question.',
  ideas: 'What could work? Suggest an approach worth trying.',
  build: 'What would help move the work forward?',
  test: 'What should we test, and how will we know it worked?',
  learn: 'What can we learn from this, and what could someone else try?',
  improve: 'How could this work better or help more people?',
}

export default function ChallengeDetail({ initial }: { initial?: Detail }) {
  const [data, setData] = useState(initial)
  const [me, setMe] = useState<Me | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState('')
  const [actual, setActual] = useState(initial?.challenge.slug ?? '')
  const refresh = useCallback(async () => {
    const slug = window.location.pathname.split('/').filter(Boolean)[1] ?? initial?.challenge.slug ?? ''
    setActual(slug)
    const r = await fetch(`/api/challenges/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!r.ok) throw new Error('The latest Challenge could not load.')
    const next = await r.json() as Detail
    setData(next); setError('')
    document.title = `${next.challenge.title} - Techno Optimists`
  }, [initial?.challenge.slug])
  useEffect(() => {
    void refresh().catch(() => setError('The latest Challenge could not load. Please retry.'))
    void getMe().then((person) => { setMe(person); setSessionReady(true) })
  }, [refresh])

  const c = data?.challenge
  if (!c || !data || actual !== c.slug) return <div><p role="status">{error || 'Loading Challenge…'}</p>{error && <button onClick={() => void refresh().catch(() => setError('The latest Challenge could not load. Please retry.'))}>Try again</button>}</div>
  const reached = STAGE_ORDER.indexOf(c.stage)
  const source = sourceLink(c.source?.url)
  return <div>
    {error && <p role="alert" className="form-error">{error} <button onClick={() => void refresh().catch(() => setError('The latest Challenge could not load. Please retry.'))}>Retry</button></p>}
    <header className="detail-header">
      <div className="detail-meta"><span>{gridRef(c.id)}</span><span className="type-pill">Started as {['idea', 'experiment'].includes(c.type) ? 'an' : 'a'} {TYPE_LABEL[c.type].toLowerCase()}</span>{(c.location || (c.lat != null && c.lng != null)) && <a className="detail-place-link" href="#location">{c.location || 'View location'} <span aria-hidden="true">↗</span></a>}</div>
      <h1>{c.emoji && <span className="challenge-emoji" aria-hidden="true">{c.emoji} </span>}{c.title}</h1>
      <p className="detail-summary">{c.summary}</p>
      <div className="detail-byline"><a className="author-avatar" href={`/people?handle=${encodeURIComponent(c.author.handle)}`} aria-label={`View @${c.author.handle} contributions`}>{c.author.handle.slice(0, 1).toUpperCase()}</a><span>{c.source ? 'Shared' : 'Spotted'} by <a href={`/people?handle=${encodeURIComponent(c.author.handle)}`}><strong>@{c.author.handle}</strong></a><span> · Active {ago(c.imported_at && c.imported_at > c.last_activity_at ? c.imported_at : c.last_activity_at)}</span></span></div>
      <div className="detail-impact"><span>Impact</span><small>Not specified</small></div>
      <details className="challenge-history"><summary><img src="/icons/chart-line.svg" width="18" height="18" alt="" />Dates and source</summary><dl>
        <div><dt>Added here</dt><dd><time dateTime={dateISO(c.imported_at ?? c.created_at)}>{formatDateTime(c.imported_at ?? c.created_at)}</time></dd></div>
        {c.imported_at && <div><dt>Original record</dt><dd><time dateTime={dateISO(c.created_at)}>{formatDate(c.created_at)}</time></dd></div>}
        <div><dt>Latest platform activity</dt><dd><time dateTime={dateISO(c.imported_at && c.imported_at > c.last_activity_at ? c.imported_at : c.last_activity_at)}>{formatDateTime(c.imported_at && c.imported_at > c.last_activity_at ? c.imported_at : c.last_activity_at)}</time></dd></div>
        {c.source && <div><dt>Source</dt><dd>{source ? <a href={source.href} target="_blank" rel="noopener noreferrer">{c.source.name ?? source.hostname} ↗</a> : c.source.name}</dd></div>}
      </dl>{c.imported_at && <p>The original record predates its addition here.</p>}</details>
      <nav className="detail-jump" aria-label="On this Challenge"><a href="#discussion">Join the discussion</a><a href="#progress">Progress log</a></nav>
    </header>
    <div className="stage-overview"><p><strong>Current stage: {STAGE_STAMP[c.stage]}</strong><span>{PROMPT[c.stage]}</span></p>
      <details className="stage-disclosure"><summary>View all stages</summary><ol className="challenge-lifecycle" aria-label="Lifecycle stages">
        {STAGE_ORDER.map((s, i) => <li key={s} className={`lifecycle-step ${i === reached ? 'is-current is-reached' : ''}`} aria-current={i === reached ? 'step' : undefined} style={{ '--stage-color': `var(--color-${s})` } as CSSProperties}><span className="stage-dot" aria-hidden="true" /><span className="stage-name">{STAGE_STAMP[s]}</span><span className="stage-description">{STAGE_MEANING[s]}</span></li>)}
      </ol></details>
    </div>
    <div className="detail-grid">
      <div className="detail-story">
        {c.media.length > 0 && <div className="detail-media">{c.media.map((m) => m.kind === 'video' ? <video key={m.url} src={m.url} controls playsInline preload="metadata" /> : <img key={m.url} src={m.url} alt={m.alt ?? ''} width={m.w} height={m.h} />)}</div>}
        {c.body && <section className="detail-section challenge-context"><h2>The Challenge</h2>{c.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</section>}
        {c.source && <div className="challenge-source"><span>Source: </span>{source ? <a href={source.href} target="_blank" rel="noopener noreferrer">{c.source.name ?? source.hostname}</a> : <span>{c.source.name ?? c.source.url}</span>}{c.source.note && <details><summary>About this source</summary><p>{c.source.note}</p></details>}</div>}
        <Discussion key={c.slug} slug={c.slug} me={me} sessionReady={sessionReady} />
        <Progress key={`progress-${c.slug}`} challenge={c} updates={data.updates} me={me} refresh={refresh} />
      </div>
      <aside className="detail-sidebar">
        <ChallengeLocation challenge={c} />
        <section id="contribute" className="detail-panel contribution-panel"><h2>How can you help?</h2><p>Have experience, an idea, or time to help?</p><div data-action-bar data-slug={c.slug}><ActionBar key={c.slug} slug={c.slug} type={c.type} actions={c.actions} /></div></section>
        <PeopleLive key={`people-${c.slug}`} slug={c.slug} initial={data.people} />
        {me?.is_admin && <Editorial key={`edit-${c.slug}`} challenge={c} refresh={refresh} />}
      </aside>
    </div>
  </div>
}
