import { describe, expect, it } from 'vitest'
import { parseDate, formatDate, formatDateTime, dateISO, relativeDate } from '../../web/src/lib/dates'
describe('shared UTC date formatting', () => {
  it('accepts D1, ISO and explicit offsets without adding a second timezone', () => {
    expect(formatDateTime('2026-09-11 03:45:45')).toBe('11 Sept 2026, 03:45 UTC')
    expect(dateISO('2026-09-11T03:45:45Z')).toBe('2026-09-11T03:45:45.000Z')
    expect(dateISO('2026-09-11T10:45:45+07:00')).toBe('2026-09-11T03:45:45.000Z')
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
  })
  it('handles missing or malformed dates without showing Invalid Date', () => {
    expect(parseDate('not a date')).toBeNull()
    expect(formatDate(null)).toBe('Date unavailable')
    expect(dateISO('')).toBeUndefined()
    expect(relativeDate('bad')).toBe('Date unavailable')
  })
  it('formats relative dates, singular units and future records', () => {
    const now = Date.parse('2026-09-11T12:00:00Z')
    expect(relativeDate('2026-09-11 03:00:00', now)).toBe('today')
    expect(relativeDate('2026-08-10T12:00:00Z', now)).toBe('1 month ago')
    expect(relativeDate('2026-10-01', now)).toBe('1 Oct 2026')
  })
})
