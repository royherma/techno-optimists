/** A small, centered local preview. The full map opens for navigation. */
export default function LocalMap({ lat, lng, label, href }: { lat:number; lng:number; label:string; href:string }) {
  const zoom = 10, count = 2 ** zoom, tileSize = 256
  const latitude = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180
  const x = (((lng + 180) % 360 + 360) % 360) / 360 * count
  const y = (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * count
  const width = 400, height = 180
  const left = x * tileSize - width / 2, top = y * tileSize - height / 2
  const tiles = []
  for (let tx = Math.floor(left / tileSize); tx <= Math.floor((left + width) / tileSize); tx++) {
    for (let ty = Math.floor(top / tileSize); ty <= Math.floor((top + height) / tileSize); ty++) {
      if (ty < 0 || ty >= count) continue
      tiles.push(<image key={`${tx}/${ty}`} href={`https://tile.openstreetmap.org/${zoom}/${((tx % count) + count) % count}/${ty}.png`} x={tx * tileSize - left} y={ty * tileSize - top} width={tileSize} height={tileSize} />)
    }
  }
  return <div className="np-local-map">
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open local map of ${label}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Local map centered on ${label}`} preserveAspectRatio="xMidYMid slice">
        {tiles}<circle cx={width / 2} cy={height / 2} r="7" fill="#a52c24" stroke="white" strokeWidth="3" />
      </svg>
    </a>
    <a className="np-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>
  </div>
}
