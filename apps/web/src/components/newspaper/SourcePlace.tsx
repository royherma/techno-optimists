import type { Challenge } from '../../../../../packages/types'
import LocalMap from './LocalMap'
import PagedContent from './PagedContent'
import { formatDate } from '../../lib/dates'
import { stageColor } from '../../lib/vocab'

export default function SourcePlace({ challenge: c }: { challenge: Challenge }) {
  const placed = c.lat != null && c.lng != null && Number.isFinite(c.lat) && Number.isFinite(c.lng)
  let source: URL | null = null
  try { const url = new URL(c.source?.url || ''); if (['http:', 'https:'].includes(url.protocol)) source = url } catch { /* Interview or other unlinked source. */ }
  const mapUrl = placed ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=11/${c.lat}/${c.lng}` : null
  return <section className="np-panel np-panel-source" aria-label="Source and place">
    <header className="np-panel-heading"><h2>Source &amp; place</h2></header>
    <div className="np-source-columns"><div className="np-place-content" aria-label="Place">
        <h3>Place</h3>
        <p>{mapUrl ? <a href={mapUrl} target="_blank" rel="noopener noreferrer">{c.location || 'Reported location'} ↗</a> : c.location || 'No location provided.'}</p>
        {placed && <LocalMap lat={c.lat!} lng={c.lng!} label={c.location || 'Reported location'} href={mapUrl!} color={stageColor(c.stage)} />}

        {!mapUrl && <p>No map coordinates provided.</p>}
      </div><div className="np-source-content"><h3>Source</h3><PagedContent compact label="Source">
        <p>{source ? <a href={source.href} target="_blank" rel="noopener noreferrer">{c.source?.name || source.hostname} ↗</a> : c.source?.name || c.source?.url || 'Shared directly here.'}</p>
        {c.source?.note && <p>{c.source.note}</p>}
        <p>Added {formatDate(c.imported_at || c.created_at)}. Latest activity {formatDate(c.last_activity_at)}.</p>
    </PagedContent></div></div>
  </section>
}
