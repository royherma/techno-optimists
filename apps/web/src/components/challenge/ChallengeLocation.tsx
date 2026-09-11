import type { Challenge } from '../../../../../packages/types/index'
import WorldPlate from '../WorldPlate'

/** Only recorded positions receive a pin; a place name is a search, not a coordinate. */
export default function ChallengeLocation({ challenge: c }: { challenge: Challenge }) {
  const placed = typeof c.lat === 'number' && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90
    && typeof c.lng === 'number' && Number.isFinite(c.lng) && Math.abs(c.lng) <= 180
  if (!c.location && !placed) return null
  const href = placed
    ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=11/${c.lat}/${c.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(c.location!)}`
  return <section id="location" className="detail-location" aria-labelledby="location-heading">
    <h2 id="location-heading">Where it’s happening</h2>
    <p className="location-name">{c.location || 'Reported location'}</p>
    {placed && <div className="location-overview"><WorldPlate pins={[{
      lat: c.lat!, lng: c.lng!, r: 15, color: 'var(--color-accent)', label: c.location || 'Reported location',
    }]} /></div>}
    <p className="location-note">{placed ? 'Reported area. The pin may not be an exact site.' : 'A place was shared, without a map pin.'}</p>
    <a className="location-open feedback-control" href={href} target="_blank" rel="noopener noreferrer">{placed ? 'Explore the local map' : 'Find this area'} <span className="feedback-icon" aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
  </section>
}
