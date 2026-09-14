import { prizeAmountLabel, type Challenge } from '../../../../../packages/types'
import StageBadge from './StageBadge'
import { editionPath } from '../../lib/edition'
import ViewsCount from './ViewsCount'
import { formatDate, relativeDate } from '../../lib/dates'

/**
 * The tile's whole prize treatment: one short string, or null.
 *
 * A closed prize still says so rather than vanishing - the thread stayed
 * because the problem did not end when the competition did, and silently
 * dropping the line would make an old card look like it never had one.
 */
function prizeMeta(prize: Challenge['prize']): string | null {
  if (!prize) return null
  const amount = prizeAmountLabel(prize.amount, prize.currency)
  const money = amount ? `${amount} prize` : 'Prize'
  // formatDate, not relativeDate: a deadline is a date someone has to act by,
  // and "in 3 months" is not something you can put in a calendar.
  const when = prize.deadline ? formatDate(prize.deadline) : null
  if (prize.status === 'closed') return when ? `${money} · closed ${when}` : `${money} · closed`
  if (prize.status === 'rolling') return `${money} · open`
  return when ? `${money} · closes ${when}` : money
}

export default function StoryTile({ challenge: c, lead = false, brief = false }: { challenge: Challenge; lead?: boolean; brief?: boolean }) {
  const href = editionPath('/c/' + c.slug)
  const dateStr = c.imported_at || c.created_at
  // One plain line in the existing meta row, at the same weight as location and
  // date. Deliberately no chip, accent or badge: a money label that outranks the
  // typed action counts would make unfunded threads read as second-class, and
  // those counts are the signal the product depends on (PRODUCT.md:88).
  const prizeLine = prizeMeta(c.prize)
  return <article className={`np-story ${lead ? 'np-lead' : ''} ${brief ? 'np-brief' : ''}`}>
    {c.media[0] && <a className="np-story-image" href={href} aria-label={`Read: ${c.title}`}>
      {c.media[0].kind === 'image' ? <img src={c.media[0].url} alt={c.media[0].alt || ''} /> : <video src={c.media[0].url} muted playsInline preload="metadata" />}{lead && <span className="np-featured">Featured</span>}
    </a>}
    <div className="np-story-copy"><p className="np-story-meta"><strong className={`type-${c.type}`}>{c.type}</strong><StageBadge stage={c.stage} /><span>{c.location || 'A shared thread'}</span>{dateStr && <span className="np-story-date" title={formatDate(dateStr)}>· {relativeDate(dateStr)}</span>}{prizeLine && <span className="np-story-prize">· {prizeLine}</span>}</p>
      <h2><a href={href}>{c.title}</a></h2><p className="np-story-summary">{c.summary}</p>
      <footer><div className="np-signals"><span title={c.type === 'problem' ? 'I have this problem' : 'I want this'}><img src="/icons/plus.svg" alt="" />{c.type === 'problem' ? c.actions.have_problem : c.actions.want_this}</span><span title="I have an idea"><img src="/icons/lightbulb.svg" alt="" />{c.actions.have_idea}</span><span title="People offering help"><img src="/icons/users.svg" alt="" />{c.actions.can_help}</span><ViewsCount count={c.views_count ?? 0} title={c.title} /></div><a className="np-read" href={href}>Open thread <span>→</span></a></footer>
    </div>
  </article>
}
