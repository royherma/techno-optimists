import { useEffect, useRef, useState } from 'react'
import { GRATICULE, LAND_PATHS, ATLAS_H, ATLAS_W, project } from '../../lib/atlas'

/** The source panel's measured shape, used until the real box reports in. */
const FALLBACK_ASPECT = 4.9

/**
 * A small, centered local preview, drawn from the same atlas as the world plate.
 *
 * This used to pull raster tiles from tile.openstreetmap.org, which made the
 * detail page the one surface running somebody else's cartography - grey roads
 * and place labels under a design whose argument is that every mark means
 * something. See the note in WorldPlate. The atlas is country-outline
 * resolution, so this reads as "which part of the world", not "which street";
 * the link out to OpenStreetMap is still there for anyone who wants the detail.
 */
export default function LocalMap({ lat, lng, label, href, color = '#a52c24' }: { lat:number; lng:number; label:string; href:string; color?:string }) {
  // A window on the shared atlas rather than a projection of its own, so a pin
  // here lands where the same coordinates land on the map page.
  const { x, y } = project(lat, lng)
  // The window carries the panel's own aspect. An earlier version took a fixed
  // 200x100 slice and let preserveAspectRatio="slice" crop it to the box, which
  // in the 146x30 source panel threw away three quarters of the vertical extent
  // and left a frame of empty sea. Sizing the window to the box instead means
  // nothing is cropped, so what the numbers select is what renders. The panel is
  // a wide strip in the grid and a squarer box on phones, so it has to be
  // measured rather than assumed.
  const box = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(FALLBACK_ASPECT)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w > 0 && h > 0) setAspect(w / h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // A third of the atlas vertically: enough that a country-outline coastline is
  // in frame, since at tighter zooms this atlas has nothing to draw.
  const height = ATLAS_H / 3, width = Math.min(ATLAS_W, height * aspect)
  const minX = Math.max(0, Math.min(ATLAS_W - width, x - width / 2))
  const minY = Math.max(0, Math.min(ATLAS_H - height, y - height / 2))
  return <div className="np-local-map" ref={box}>
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open local map of ${label}`}>
      <svg viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label={`Local map centered on ${label}`} preserveAspectRatio="xMidYMid meet">
        <rect x={minX} y={minY} width={width} height={height} fill="var(--color-paper-sunk)" />
        {GRATICULE.meridians.map(lng => {
          const p = project(0, lng)
          return <line key={`m${lng}`} x1={p.x} y1={minY} x2={p.x} y2={minY + height} stroke="var(--color-grid-line)" strokeWidth="0.5" />
        })}
        {GRATICULE.parallels.map(lat => {
          const p = project(lat, 0)
          return <line key={`p${lat}`} x1={minX} y1={p.y} x2={minX + width} y2={p.y} stroke="var(--color-grid-line)" strokeWidth="0.5" />
        })}
        {LAND_PATHS.map((d, i) => <path key={i} d={d} fill="var(--color-paper)" stroke="var(--color-rule)" strokeWidth="0.6" strokeLinejoin="round" />)}
        <circle cx={x} cy={y} r="4" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx={x} cy={y} r="1.8" fill={color} />
      </svg>
    </a>
  </div>
}
