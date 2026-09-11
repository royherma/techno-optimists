/** D1 timestamps are UTC; ISO inputs may already carry an offset. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const input = value.trim().replace(' ', 'T')
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(input) || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input : `${input}Z`)
  return Number.isFinite(date.getTime()) ? date : null
}
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? day.format(date) : 'Date unavailable'
}
export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value)
  return date ? `${day.format(date)}, ${clock.format(date)} UTC` : 'Date unavailable'
}
export function dateISO(value: string | null | undefined): string | undefined {
  return parseDate(value)?.toISOString()
}
export function relativeDate(value: string, now = Date.now()): string {
  const date = parseDate(value)
  if (!date) return 'Date unavailable'
  const days = Math.floor((now - date.getTime()) / 864e5)
  if (days < 0) return formatDate(value)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) { const months = Math.floor(days / 30); return `${months} month${months === 1 ? '' : 's'} ago` }
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}
