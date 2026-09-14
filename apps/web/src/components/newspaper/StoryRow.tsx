import { prizeAmountLabel, type Challenge } from '../../../../../packages/types'
import StageBadge from './StageBadge'
import { editionPath } from '../../lib/edition'
import ViewsCount from './ViewsCount'
import { formatDate, relativeDate } from '../../lib/dates'

/**
 * One thread as a list row. The grid tile sells a single thread; this sells the
 * set, so every column is a value you can scan down and compare across rows.
 * Same fields as the tile, one line each.
 */
export default function StoryRow({ challenge: c }: { challenge: Challenge }) {
  const href = editionPath('/c/' + c.slug)
  const dateStr = c.imported_at || c.created_at
  const amount = c.prize ? prizeAmountLabel(c.prize.amount, c.prize.currency) : null
  const wantLabel = c.type === 'problem' ? 'I have this problem' : 'I want this'
  const media = c.media[0]
  return <article className="np-row">
    {/* A thread with no media still occupies the column, so every later column
      * stays on the same vertical line down the page. */}
    {media
      ? <a className="np-row-thumb" href={href} aria-label={`Read: ${c.title}`} tabIndex={-1}>
          {media.kind === 'image'
            ? <img src={media.url} alt={media.alt || ''} loading="lazy" decoding="async" />
            : <video src={media.url} muted playsInline preload="metadata" />}
        </a>
      : <span className={`np-row-thumb np-row-thumb-blank type-${c.type}`} aria-hidden="true" />}
    <strong className={`np-row-type type-${c.type}`}>{c.type}</strong>
    <span className="np-row-stage"><StageBadge stage={c.stage} /></span>
    <h2 className="np-row-title"><a href={href}>{c.title}</a><span className="np-row-summary">{c.summary}</span></h2>
    <span className="np-row-place">{c.location || 'A shared thread'}</span>
    <span className="np-row-date" title={dateStr ? formatDate(dateStr) : undefined}>{dateStr ? relativeDate(dateStr) : ''}</span>
    <span className="np-row-prize">{amount || ''}</span>
    <span className="np-row-signals">
      <span title={wantLabel}><img src="/icons/plus.svg" alt="" />{c.type === 'problem' ? c.actions.have_problem : c.actions.want_this}</span>
      <span title="I have an idea"><img src="/icons/lightbulb.svg" alt="" />{c.actions.have_idea}</span>
      <span title="People offering help"><img src="/icons/users.svg" alt="" />{c.actions.can_help}</span>
      <ViewsCount count={c.views_count ?? 0} title={c.title} />
    </span>
  </article>
}
