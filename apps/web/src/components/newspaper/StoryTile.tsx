import type { Challenge } from '../../../../../packages/types'
import { editionPath } from '../../lib/edition'
import ViewsCount from './ViewsCount'
export default function StoryTile({ challenge: c, lead = false, brief = false }: { challenge: Challenge; lead?: boolean; brief?: boolean }) {
  const href = editionPath('/c/' + c.slug)
  return <article className={`np-story ${lead ? 'np-lead' : ''} ${brief ? 'np-brief' : ''}`}>
    {c.media[0] && <a className="np-story-image" href={href} aria-label={`Read: ${c.title}`}>
      {c.media[0].kind === 'image' ? <img src={c.media[0].url} alt={c.media[0].alt || ''} /> : <video src={c.media[0].url} muted playsInline preload="metadata" />}{lead && <span className="np-featured">Featured</span>}
    </a>}
    <div className="np-story-copy"><p className="np-story-meta"><strong className={`type-${c.type}`}>{c.type}</strong><span>{c.location || 'A shared Challenge'}</span></p>
      <h2><a href={href}>{c.title}</a></h2><p className="np-story-summary">{c.summary}</p>
      <footer><div className="np-signals"><span title={c.type === 'problem' ? 'I have this problem' : 'I want this'}><img src="/icons/plus.svg" alt="" />{c.type === 'problem' ? c.actions.have_problem : c.actions.want_this}</span><span title="I have an idea"><img src="/icons/lightbulb.svg" alt="" />{c.actions.have_idea}</span><span title="People offering help"><img src="/icons/users.svg" alt="" />{c.actions.can_help}</span><ViewsCount count={c.views_count ?? 0} title={c.title} /></div><a className="np-read" href={href}>Open Challenge <span>→</span></a></footer>
    </div>
  </article>
}
