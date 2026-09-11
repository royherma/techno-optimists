import { useState } from 'react'
import { project } from '../lib/atlas'
import WorldPlate from './WorldPlate'

/**
 * Where the Challenge is, set on a map instead of typed.
 *
 * Two ways in, because they answer different situations: "Use my location"
 * for the person standing in front of the problem, and a click on the plate
 * for everyone else - reporting somewhere they are not, or on a desktop with
 * no useful GPS.
 *
 * Placing is optional and stays optional. A Challenge with no pin is complete;
 * the map is a view of the ones that carry a position, never a gate on posting.
 */
export default function PlacePicker({
  lat,
  lng,
  onChange,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number | null, lng: number | null) => void
}) {
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'unavailable'>('idle')
  const placed = lat != null && lng != null

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setState('unavailable')
      return
    }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(
          Math.round(pos.coords.latitude * 1000) / 1000,
          Math.round(pos.coords.longitude * 1000) / 1000,
        )
        setState('idle')
      },
      // A refusal is a normal answer, not an error to apologise for: the map
      // still takes a click, so the flow continues either way.
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const pin = placed ? project(lat, lng) : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={state === 'locating'}
          className="ink-transition border border-(--color-rule) px-4 py-2 text-sm hover:bg-(--color-paper-sunk) disabled:opacity-40"
        >
          {state === 'locating' ? 'Finding you...' : 'Use my location'}
        </button>
        {placed && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="ink-transition ink-underline text-sm text-(--color-ink-soft) hover:text-(--color-ink)"
          >
            Clear the pin
          </button>
        )}
        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] tabular-nums text-(--color-ink-faint)">
          {placed ? `${lat.toFixed(3)}, ${lng.toFixed(3)}` : 'No pin yet'}
        </span>
      </div>

      <div className="border border-(--color-rule)">
        <WorldPlate onPick={(la, ln) => onChange(la, ln)}>
          {pin && (
            <g>
              {/* The pin is the same contour mark the rest of the sheet uses for
                  a placed thing, so the picker teaches the map page's symbol. */}
              <circle cx={pin.x} cy={pin.y} r="14" fill="none" stroke="var(--color-spot)" strokeWidth="2.5" />
              <circle cx={pin.x} cy={pin.y} r="5" fill="var(--color-spot)" />
            </g>
          )}
        </WorldPlate>
      </div>

      <p className="text-xs text-(--color-ink-faint)">
        {state === 'denied'
          ? 'Location is off for this site. Click the map to place it instead.'
          : state === 'unavailable'
            ? 'This browser cannot report a location. Click the map to place it instead.'
            : 'Click anywhere to place this thread. Optional - a thread without a place is still complete.'}
      </p>
    </div>
  )
}
