import { useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import { STAGE_ORDER, STAGE_STAMP, STAGE_MEANING, LEGEND_ACTIONS, LEGEND_ACTION_LABEL, IMPACT_LABELS } from '../../lib/vocab'
import WorldPlate from '../WorldPlate'
import { editionPath } from '../../lib/edition'

const icons = ['plus', 'lightbulb', 'users', 'play', 'star']
export function Rings({ count, size = 38 }: { count: number; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">{Array.from({ length: count }, (_, i) => <circle key={i} cx="24" cy="24" r={5 + i * 4} fill="none" stroke="currentColor" strokeWidth="1.5" />)}</svg>
}
export default function Legend({ challenges = [] }: { challenges?: Challenge[] }) {
  const [section, setSection] = useState('stages')
  return <div className="np-legend">
    <header className="np-rule-heading"><h2>The field guide</h2><span>Legend</span></header>
    <nav className="np-legend-tabs" aria-label="Legend sections">{['stages','rings','actions','world'].map(id => <button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{id}</button>)}</nav>
    <section className={'np-legend-rings ' + (section === 'rings' ? 'selected' : '')}>
      <h3>Impact (contour rings)</h3><div className="np-rings-scale">{[1,2,3,4,5].map(n => <div key={n}><Rings count={n} /><span>{IMPACT_LABELS[n - 1]}</span></div>)}</div><p>Impact scope, not activity. Unspecified impact is left unmarked.</p>
    </section>
    <section className={'np-legend-stages ' + (section === 'stages' ? 'selected' : '')}>
      <h3>From noticing to improving</h3><ul>{STAGE_ORDER.map(stage => <li key={stage}><i className={`np-stage-color stage-${stage}`} /><strong>{STAGE_STAMP[stage]}</strong><span>{STAGE_MEANING[stage]}</span></li>)}</ul>
    </section>
    <section className={'np-legend-actions ' + (section === 'actions' ? 'selected' : '')}>
      <h3>Every action means something</h3><ul>{LEGEND_ACTIONS.map((action, i) => <li key={action}><img src={`/icons/${icons[i]}.svg`} width="18" height="18" alt="" /><span>{LEGEND_ACTION_LABEL[action]}</span></li>)}</ul>
    </section>
    <section className={'np-legend-world ' + (section === 'world' ? 'selected' : '')}>
      <h3>Around the world</h3><a href="/v2/map" aria-label="Explore Challenges on the world map"><WorldPlate pins={challenges.filter(c => c.lat != null && c.lng != null).map(c => ({ lat: c.lat!, lng: c.lng!, r: 5, color: '#ac342c', label: c.location || c.title }))} /></a><a className="np-arrow-link" href="/v2/map">Explore the map <span>→</span></a>
      <div className="np-latest"><h3>Recently active</h3>{challenges.slice(0,2).map(c => <a key={c.id} href={editionPath('/c/' + c.slug)}>{c.media[0]?.kind === 'image' && <img src={c.media[0].url} alt="" />}<span>{c.title}</span></a>)}</div>
    </section>
    <p className="np-legend-quote">“Real progress starts with people who care enough to notice.”</p>
  </div>
}
