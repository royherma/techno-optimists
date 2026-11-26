const ENDPOINT = '/api/client-errors'
const MAX_REPORTS = 5
const MESSAGE_MAX = 500
const STACK_MAX = 2000
const UA_MAX = 400
const URL_MAX = 1000
const BODY_MAX = 8000

let sent = 0

type BrowserErrorReport = { message: string; stack: string; url: string; ua: string }

function text(value: unknown) {
  try { return String(value ?? '') } catch { return '' }
}

function send(message: unknown, stack: unknown) {
  if (sent >= MAX_REPORTS) return
  sent++
  const report: BrowserErrorReport = {
    message: (text(message).trim() || 'Unknown error').slice(0, MESSAGE_MAX),
    stack: text(stack).slice(0, STACK_MAX),
    url: `${location.origin}${location.pathname}${location.search}`.slice(0, URL_MAX),
    ua: navigator.userAgent.slice(0, UA_MAX),
  }
  let body = JSON.stringify(report)
  let blob = new Blob([body], { type: 'application/json' })
  // JSON escaping and multibyte characters can exceed the route's byte limit.
  while (blob.size > BODY_MAX) {
    const field = report.stack ? 'stack' : report.ua ? 'ua' : 'message'
    report[field] = report[field].slice(0, Math.floor(report[field].length / 2))
    body = JSON.stringify(report)
    blob = new Blob([body], { type: 'application/json' })
  }
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, blob)) return
  } catch {}
  try {
    void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {}
}

window.addEventListener('error', (event) => {
  const err = event.error
  const where = event.filename ? `at ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : ''
  send(event.message, err instanceof Error && err.stack ? err.stack : where)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  send(reason instanceof Error ? reason.message : reason, reason instanceof Error && reason.stack ? reason.stack : '')
})
