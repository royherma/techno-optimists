const ENDPOINT = '/api/client-errors'
const MAX_REPORTS = 5
const MESSAGE_MAX = 500
const STACK_MAX = 2000
const UA_MAX = 400
const URL_MAX = 1000
const BODY_MAX = 8000

let sent = 0

type BrowserErrorReport = { message: string; stack: string; url: string; ua: string }

function send(message: string, stack: string) {
  if (sent >= MAX_REPORTS) return
  sent++
  const report: BrowserErrorReport = {
    message: (message.trim() || 'Unknown error').slice(0, MESSAGE_MAX),
    stack: stack.slice(0, STACK_MAX),
    url: `${location.origin}${location.pathname}${location.search}`.slice(0, URL_MAX),
    ua: navigator.userAgent.slice(0, UA_MAX),
  }
  let body = JSON.stringify(report)
  while (new TextEncoder().encode(body).byteLength > BODY_MAX && report.stack.length) {
    report.stack = report.stack.slice(0, Math.floor(report.stack.length / 2))
    body = JSON.stringify(report)
  }
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return
  } catch {}
  try {
    void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {}
}

window.addEventListener('error', (event) => {
  const err = event.error
  const where = event.filename ? `at ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : ''
  send(String(event.message ?? ''), err instanceof Error && err.stack ? err.stack : where)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  let message = 'Unknown rejection'
  let stack = ''
  try {
    message = reason instanceof Error ? reason.message : String(reason)
    stack = reason instanceof Error && reason.stack ? reason.stack : ''
  } catch {}
  send(message, stack)
})
