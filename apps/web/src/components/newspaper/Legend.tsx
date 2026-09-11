import { useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import { STAGE_ORDER, STAGE_STAMP, STAGE_MEANING, IMPACT_LABELS, impactLabel } from '../../lib/vocab'
import WorldPlate from '../WorldPlate'
import './legend-context.css'
import { editionPath } from '../../lib/edition'

export function Rings({ count, size = 38 }: { count: number; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">{Array.from({ length: count }, (_, i) => <circle key={i} cx="24" cy="24" r={5 + i * 4} fill="none" stroke="currentColor" strokeWidth="1.5" />)}</svg>
}
export default function Legend({ challenges = [], impact = null }: { challenges?: Challenge[]; impact?: number | null }) {
  const [section, setSection] = useState('stages')
  // Passed down from the route, never derived from `challenges` - the shell
  // receives the whole feed on a detail page, so the array cannot say which
  // Challenge is open. Null on the front page, the map and every other screen.
  const current = impactLabel(impact)
  return <div className="np-legend">
    <header className="np-rule-heading"><h2>The field guide</h2><span>Legend</span></header>
    <nav className="np-legend-tabs" aria-label="Legend sections">{['stages','rings','world'].map(id => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{id}</button>)}</nav>
    <section className={'np-legend-rings ' + (section === 'rings' ? 'selected' : '')}>
      <h3>Impact (contour rings)</h3><p className="np-impact-current"><strong>This thread: {current ? `impact ${current}` : 'impact not specified'}</strong></p><div className="np-rings-scale">{[1,2,3,4,5].map(n => <div key={n} className={n === impact ? 'is-current' : undefined}><Rings count={n} /><span>{n === 2 ? <>Neighbour<wbr />hood</> : IMPACT_LABELS[n - 1]}</span></div>)}</div><p>Impact scope, not activity. Unspecified impact is left unmarked.</p>
    </section>
    <section className={'np-legend-stages ' + (section === 'stages' ? 'selected' : '')}>
      <h3>From noticing to improving</h3><p className="np-guide-context">The highlighted stage is where this thread is now.</p><ul>{STAGE_ORDER.map(stage => <li key={stage} data-stage={stage}><i className={`np-stage-color stage-${stage}`} /><strong>{STAGE_STAMP[stage]}<small className="np-stage-now">Current stage</small></strong><span>{STAGE_MEANING[stage]}</span></li>)}</ul>
    </section>
    <section className={'np-legend-world ' + (section === 'world' ? 'selected' : '')}>
      <h3>Around the world</h3><a href="/map" aria-label="Explore threads on the world map"><WorldPlate pins={challenges.filter(c => c.lat != null && c.lng != null).map(c => ({ lat: c.lat!, lng: c.lng!, r: 5, color: '#ac342c', label: c.location || c.title }))} /></a><a className="np-arrow-link" href="/map">Explore the map <span>→</span></a>
      <div className="np-latest"><h3>Recently active</h3>{challenges.slice(0,2).map(c => <a key={c.id} href={editionPath('/c/' + c.slug)}>{c.media[0]?.kind === 'image' && <img src={c.media[0].url} alt="" />}<span>{c.title}</span></a>)}</div>
    </section>
    <p className="np-legend-quote">“Real progress starts with people who care enough to notice.”</p>
  </div>
}
