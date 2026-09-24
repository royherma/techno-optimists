const ENDPOINT = '/api/client-errors'
const MAX_REPORTS = 5
const STACK_MAX = 2000

let sent = 0

type ClientErrorReport = { message: string; source: string; line: number; col: number; stack: string; path: string }

function send(report: ClientErrorReport) {
  if (sent >= MAX_REPORTS) return
  sent++
  const body = JSON.stringify(report)
  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
  } else {
    void fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
  }
}

window.addEventListener('error', (event) => {
  send({
    message: String(event.message ?? '').slice(0, 500),
    source: event.filename ?? '',
    line: event.lineno ?? 0,
    col: event.colno ?? 0,
    stack: event.error?.stack ? String(event.error.stack).slice(0, STACK_MAX) : '',
    path: location.pathname,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error && reason.stack ? reason.stack : ''
  send({
    message: message.slice(0, 500),
    source: '',
    line: 0,
    col: 0,
    stack: stack.slice(0, STACK_MAX),
    path: location.pathname,
  })
})
