import { useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import WorldPlate from '../WorldPlate'
import PagedContent from './PagedContent'
import { stageColor } from '../../lib/vocab'
import { formatDate } from '../../lib/dates'

export default function SourcePlace({ challenge: c }: { challenge: Challenge }) {
  const placed = c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng)
  const [section, setSection] = useState<'source' | 'place'>(placed ? 'place' : 'source')
  let source: URL | null = null
  try { const url = new URL(c.source?.url || ''); if (['http:', 'https:'].includes(url.protocol)) source = url } catch { /* Interview or other unlinked source. */ }
  const mapUrl = placed ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=11/${c.lat}/${c.lng}` : null
  return <section className="np-panel np-panel-source" aria-label="Source and place">
    <header className="np-panel-heading"><h2>Source &amp; place</h2></header>
    <nav className="np-source-tabs" aria-label="Source and place sections">{(['source', 'place'] as const).map(id => <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{id === 'source' ? 'Source' : 'Place'}</button>)}</nav>
    <PagedContent compact label={section === 'place' ? 'Place' : 'Source'} resetKey={section}>
      {section === 'place' ? <>
        <p>{c.location || (placed ? 'Reported location' : 'No location provided.')}</p>
        {placed && <a className="np-place-map" href={mapUrl!} target="_blank" rel="noopener noreferrer" aria-label={`Open map of ${c.location || 'reported location'}`}><WorldPlate pins={[{ lat:c.lat!, lng:c.lng!, r:9, color:stageColor(c.stage), label:c.location || 'Reported location' }]} /></a>}
        {mapUrl ? <p><a href={mapUrl} target="_blank" rel="noopener noreferrer">Explore this location ↗</a></p> : <p>No map coordinates provided.</p>}
      </> : <>
        <p>{source ? <a href={source.href} target="_blank" rel="noopener noreferrer">{c.source?.name || source.hostname} ↗</a> : c.source?.name || c.source?.url || 'Shared directly here.'}</p>
        {c.source?.note && <p>{c.source.note}</p>}
        <p>Added {formatDate(c.imported_at || c.created_at)}. Latest activity {formatDate(c.last_activity_at)}.</p>
      </>}
    </PagedContent>
  </section>
}
