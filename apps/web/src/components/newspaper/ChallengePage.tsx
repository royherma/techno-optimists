import { useEffect, useRef, useState, type ReactNode } from 'react'
import { prizeAmountLabel, type Challenge, type Update } from '../../../../../packages/types'
import type { DetailPerson } from '../../lib/api'
import { getMe, type Me } from '../../lib/session'
import { STAGE_MEANING, STAGE_STAMP, impactLabel } from '../../lib/vocab'
import { formatDate, relativeDate } from '../../lib/dates'
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
/**
 * The full prize statement. This is where someone who is actually interested
 * arrives, so the fact gets stated properly rather than compressed to a chip.
 *
 * A closed prize keeps its block and loses its entry link: the thread stayed
 * because the problem outlived the competition, and an entry link that leads to
 * a closed form wastes the reader's time.
 */
function PrizeBlock({ prize }: { prize: NonNullable<Challenge['prize']> }) {
  const amount = prizeAmountLabel(prize.amount, prize.currency)
  const closed = prize.status === 'closed'
  const enterable = !closed && prize.url?.startsWith('http')
  return <div className="np-prize" data-status={prize.status}>
    <div className="np-prize-header">
      <span className="np-prize-badge">{closed ? 'Prize closed' : 'Prize offered'}</span>
      {amount && <strong className="np-prize-amount">{amount}</strong>}
    </div>
    <p className="np-prize-terms">
      {prize.deadline && <span>{closed ? 'Closed' : prize.status === 'closing_soon' ? 'Closes soon -' : 'Entries close'} {formatDate(prize.deadline)}</span>}
      {!prize.deadline && <span>Entries are rolling</span>}
    </p>
    {prize.note && <p className="np-prize-note">{prize.note}</p>}
    {/*
      Named sponsor and the hands-off line, stated once at the point the reader
      acts on it. This is a legal relationship they need, not a status report -
      see the copy rules in CLAUDE.md.
    */}
    {prize.sponsor && <p className="np-prize-legal">{`Run by ${prize.sponsor}. Enter on their site - Techno Optimists is not involved in judging or payment.`}</p>}
    {enterable && <a className="np-prize-link" href={prize.url!} target="_blank" rel="noopener noreferrer">{`Enter on ${prize.sponsor || 'the sponsor'}’s site`} ↗</a>}
  </div>
}

/**
 * What is wrong, and why it is still open.
 *
 * This sits directly under the deck because that is where a reader looks for it
 * and where it was missing: the facts existed but arrived pipe-joined inside the
 * source note, so the page answered "what is this about" and never "what is the
 * problem".
 *
 * Two rules hold the section honest, and both are why it can be trusted:
 * a heading only prints when its own text is present, and the whole block
 * disappears when there is nothing to say. A build that works is not a problem
 * with blank fields - it gets the need it answers, under its own heading, and
 * no "why this is unsolved" at all.
 */
function Briefing({ briefing, type }: { briefing: NonNullable<Challenge['briefing']>; type: Challenge['type'] }) {
  // A fix already exists on these, so "the problem" would be the wrong word for
  // something nobody is still stuck on.
  const isFix = type === 'build' || type === 'idea' || type === 'experiment'
  if (!briefing.problem && !briefing.why_unsolved && !briefing.evidence) return null
  return <div className="np-briefing">
    {briefing.problem && <div className="np-briefing-part">
      <h2>{isFix ? 'What this solves' : 'The problem'}</h2>
      <p>{briefing.problem}</p>
    </div>}
    {briefing.why_unsolved && <div className="np-briefing-part">
      <h2>{isFix ? 'What stands in the way' : "Why it isn't solved"}</h2>
      <p>{briefing.why_unsolved}</p>
    </div>}
    {briefing.evidence && <blockquote className="np-briefing-evidence">{briefing.evidence}</blockquote>}
  </div>
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
    if (!response.ok) throw new Error('The latest thread could not load. Try again.')
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
  if (!data) return <div className="np-empty"><h1>{error || 'Opening the thread…'}</h1>{error && <button onClick={() => void refresh().catch(e => setError(e.message))}>Try again</button>}</div>
  const c = data.challenge, image = c.media[Math.min(media, c.media.length - 1)]
  const dateStr = c.imported_at || c.created_at
  return <div className="np-challenge np-challenge-sheet" data-stage={c.stage}>
    <div className="np-challenge-kicker"><a href="/">← All threads</a><span className={`type-${c.type}`}>{c.type} <span> / {c.location || 'Around the world'}</span></span><StageBadge stage={c.stage} /><span className="np-relative">{impactLabel(c.impact) ? `Impact: ${impactLabel(c.impact)}` : 'Impact not specified'}</span>{dateStr && <span className="np-kicker-date" title={formatDate(dateStr)}>Posted {relativeDate(dateStr)}</span>}{me?.is_admin && <button onClick={() => setEditing(true)}>Edit thread</button>}</div>
    {error && <p className="np-error" role="alert">{error} <button onClick={() => void refresh().catch(e => setError(e.message))}>Retry</button></p>}
    <div className="np-panel-grid">
      <section className="np-panel np-panel-story" aria-label="thread story">
        <div className="np-story-plate">
          {image?.kind === 'video' ? <video src={image.url} controls playsInline /> : image ? <img src={image.url} alt={image.alt || ''} /> : <p>Things can be better.</p>}
          {c.media.length > 1 && <div className="np-media-controls"><button aria-label="Previous image" disabled={media === 0} onClick={() => setMedia(media - 1)}>←</button><span>{media + 1} / {c.media.length}</span><button aria-label="Next image" disabled={media + 1 >= c.media.length} onClick={() => setMedia(media + 1)}>→</button></div>}
        </div>
        <div className="np-story-reading">
          <PagedContent compact label="Story">
            <h1>{c.title}</h1>
            <p className="np-deck">{c.summary}</p>
            <p className="np-story-author">Shared by <a href={'/people?handle=' + encodeURIComponent(c.author.handle)}>@{c.author.handle}</a> · Posted {relativeDate(dateStr)} ({formatDate(dateStr)}) <ViewsCount count={c.views_count ?? 0} title={c.title} /></p>
            {c.briefing && <Briefing briefing={c.briefing} type={c.type} />}
            {c.body && c.body.split(/\n\s*\n/).map((p, i) => {
              if (p.includes('\n- ')) {
                const parts = p.split('\n- ')
                return <div key={i} className="np-body-list"><p><strong>{parts[0]}</strong></p><ul>{parts.slice(1).map((li, j) => <li key={j}>{li}</li>)}</ul></div>
              }
              if (p.endsWith(':')) {
                return <h3 key={i} className="np-body-heading">{p}</h3>
              }
              return <p key={i}>{p}</p>
            })}
            {c.prize && <PrizeBlock prize={c.prize} />}
            {(c.source?.note || c.source?.url || c.source?.name) && (
              <div className="np-article-briefing">
                <div className="np-briefing-header">
                  <span className="np-briefing-badge">Source</span>
                  {c.source?.name && <span className="np-briefing-outlet">Reported by <strong>{c.source.name}</strong></span>}
                </div>
                {/*
                  Provenance only - how the row was checked and where the cover
                  came from. The problem, the reason and the quote moved up into
                  Briefing, where they can be read as separate answers. Older
                  rows still carry the pipe-joined blob here until the backfill
                  splits them, so this stays a plain paragraph.
                */}
                {c.source?.note && <p className="np-briefing-note">{c.source.note}</p>}
                {c.source?.url && (
                  <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="np-briefing-link">
                    Read original article on {c.source.name || 'source site'} ↗
                  </a>
                )}
              </div>
            )}
          </PagedContent>
        </div>
      </section>
      <Panel name="help" title="How you can help"><ActionBar slug={c.slug} type={c.type} actions={c.actions} /></Panel>
      <Panel name="discussion" title="Discussion"><Discussion panel slug={c.slug} me={me} sessionReady={sessionReady} /></Panel>
      <Panel name="progress" title="Progress"><p className="np-current-stage"><span className={`np-stage-color stage-${c.stage}`} /> <strong>{STAGE_STAMP[c.stage]}</strong> · {STAGE_MEANING[c.stage]}</p><Progress panel challenge={c} updates={data.updates} me={me} refresh={refresh} /></Panel>
      <Panel name="people" title="People"><PeopleLive slug={c.slug} initial={data.people} /></Panel>
      <SourcePlace challenge={c} />
    </div>
    {me?.is_admin && <PanelDialog title="Edit thread" open={editing} onClose={() => setEditing(false)}><Editorial challenge={c} refresh={refresh} /></PanelDialog>}
  </div>
}
