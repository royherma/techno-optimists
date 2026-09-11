import { GRATICULE, LAND_PATHS, ATLAS_H, ATLAS_W, project } from '../lib/atlas'

/**
 * The world, drawn as part of the sheet.
 *
 * This is deliberately not a slippy map. A tile layer would drag in a key, a
 * per-view network cost and somebody else's cartography - grey roads and place
 * labels in a design whose whole argument is that every mark means something.
 * The atlas is 80 lines of coordinates, renders offline, costs no request, and
 * takes the sheet's own ink.
 *
 * Both map surfaces share it: the picker on the capture form and the map page.
 * They differ only in what they draw on top, which is what `children` is for.
 */
/** One mark on the plate. lat/lng, not x/y - the caller never does geometry. */
export type Pin = {
  lat: number
  lng: number
  /** Ring radius in SVG units. */
  r: number
  color: string
  /** Set when the pin should be a link into the Challenge. */
  href?: string
  label?: string
  type?: string
  search?: string
}

export default function WorldPlate({
  pins = [],
  children,
  onPick,
  className = '',
  onPreview,
  selectedIndex,
}: {
  /*
   * Pins arrive as data, never as slotted children. This component hydrates
   * (`client:load`), and SVG elements rendered by Astro into the children slot
   * do not survive that hydration - React re-renders the subtree and the
   * server-drawn nodes vanish, leaving an empty plate whose markup still
   * contains every pin. Props serialize, so they cross the boundary intact.
   */
  pins?: Pin[]
  onPreview?: (index: number) => void
  selectedIndex?: number
  children?: React.ReactNode
  /** When set the plate is a control: clicking it reports a position. */
  onPick?: (lat: number, lng: number) => void
  className?: string
}) {
  // A click has to become a coordinate in the SVG's own units, not the
  // element's pixels - the plate is responsive, so those differ at every width.
  // getBoundingClientRect is the only honest source for the rendered box.
  function pick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPick) return
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * ATLAS_W
    const y = ((e.clientY - box.top) / box.height) * ATLAS_H
    const lat = 90 - (y / ATLAS_H) * 180
    const lng = (x / ATLAS_W) * 360 - 180
    onPick(Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000)
  }

  return (
    <svg
      viewBox={`0 0 ${ATLAS_W} ${ATLAS_H}`}
      className={`block w-full ${onPick ? 'cursor-crosshair' : ''} ${className}`}
      onClick={pick}
      role={onPick ? 'application' : 'group'}
      aria-label={onPick ? 'World map. Click to place this Challenge.' : 'World map of Challenges'}
    >
      <rect x="0" y="0" width={ATLAS_W} height={ATLAS_H} fill="var(--color-paper-sunk)" />

      {/*
        The graticule, in the same weak blue as the graph paper behind the
        sheet. It is the only mark on the plate that means nothing, so it must
        never outweigh the land or the pins - the rule the token system already
        states for the page background.
      */}
      {GRATICULE.meridians.map((lng) => {
        const { x } = project(0, lng)
        return <line key={`m${lng}`} x1={x} y1="0" x2={x} y2={ATLAS_H} stroke="var(--color-grid-line)" strokeWidth="1" />
      })}
      {GRATICULE.parallels.map((lat) => {
        const { y } = project(lat, 0)
        return <line key={`p${lat}`} x1="0" y1={y} x2={ATLAS_W} y2={y} stroke="var(--color-grid-line)" strokeWidth="1" />
      })}

      {/* Land: filled flat, no outline flourish. It is the ground the pins sit on. */}
      {LAND_PATHS.map((d, i) => (
        <path key={i} d={d} fill="var(--color-paper)" stroke="var(--color-rule)" strokeWidth="1.2" strokeLinejoin="round" />
      ))}

      {/* The equator reads slightly heavier - the one line a reader orients from. */}
      <line x1="0" y1={ATLAS_H / 2} x2={ATLAS_W} y2={ATLAS_H / 2} stroke="var(--color-grid-ink)" strokeWidth="0.8" opacity="0.45" />

      {pins.map((p, i) => {
        const { x, y } = project(p.lat, p.lng)
        const mark = (
          <>
            <circle cx={x} cy={y} r={p.r} fill="none" stroke={p.color} strokeWidth="2.2" />
            <circle cx={x} cy={y} r="2.6" fill={p.color} />
          </>
        )
        return onPreview ? (
          <g key={i} role="button" tabIndex={0} aria-label={p.label} aria-pressed={selectedIndex === i} className="map-pin"
            onMouseEnter={() => onPreview(i)} onFocus={() => onPreview(i)} onClick={() => onPreview(i)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(i) } }}>
            <circle cx={x} cy={y} r={Math.max(p.r + 6, 16)} fill="transparent" className="pin-hit" />
            {mark}
          </g>
        ) : p.href ? (
          <a key={i} href={p.href} aria-label={p.label} className="map-pin" data-feed-pin data-type={p.type} data-search={p.search}>
            {p.label && <title>{p.label}</title>}
            <circle cx={x} cy={y} r={Math.max(p.r + 6, 16)} fill="transparent" className="pin-hit" />
            {mark}
          </a>
        ) : (
          <g key={i}>
            {p.label && <title>{p.label}</title>}
            {mark}
          </g>
        )
      })}

      {children}
    </svg>
  )
}
