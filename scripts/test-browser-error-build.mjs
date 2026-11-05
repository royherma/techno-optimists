import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'

const dist = new URL('../apps/web/dist/', import.meta.url)
const files = await readdir(dist, { recursive: true })
const pages = files.filter((file) => file.endsWith('.html'))
assert.ok(pages.includes('index.html'), 'run npm run build:web:only before this check')
const reporters = new Set()
let checked = 0
for (const page of pages) {
  const html = await readFile(new URL(page, dist), 'utf8')
  if (/<meta[^>]+http-equiv="refresh"/i.test(html)) continue
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).filter((script) => script.includes('/api/client-errors'))
  assert.equal(scripts.length, 1, `${page}: one browser error reporter`)
  const hash = createHash('sha256').update(scripts[0]).digest('base64')
  const csp = html.match(/http-equiv="content-security-policy" content="([^"]*)"/i)?.[1] ?? ''
  assert.ok(csp.includes(`sha256-${hash}`), `${page}: CSP permits the reporter`)
  reporters.add(scripts[0])
  checked++
}
assert.ok(checked > 0, 'at least one rendered page checked')
for (const script of reporters) {
  const listeners = {}
  const requests = []
  const context = createContext({
    TextEncoder,
    location: { origin: 'https://example.com', pathname: '/c/test', search: '' },
    navigator: { userAgent: 'BuildTest' },
    window: { addEventListener: (type, listener) => { listeners[type] = listener } },
    fetch: (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) })
      return Promise.resolve()
    },
    listeners,
  })
  runInContext(script, context)
  assert.equal(typeof listeners.error, 'function')
  assert.equal(typeof listeners.unhandledrejection, 'function')
  runInContext(`
    for (let i = 0; i < 10; i++) {
      if (i % 2) listeners.error({ message: 'error ' + i, error: new Error('error ' + i) })
      else listeners.unhandledrejection({ reason: new Error('rejection ' + i) })
    }
  `, context)
  assert.equal(requests.length, 5, 'built reporter shares a five-report budget across event types')
  assert.deepEqual(requests.map(({ body }) => body.message), ['rejection 0', 'error 1', 'rejection 2', 'error 3', 'rejection 4'])
  for (const { url, options, body } of requests) {
    assert.equal(url, '/api/client-errors')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['content-type'], 'application/json')
    assert.equal(options.keepalive, true)
    assert.deepEqual(Object.keys(body).sort(), ['message', 'stack', 'ua', 'url'])
    assert.equal(body.url, 'https://example.com/c/test')
    assert.equal(body.ua, 'BuildTest')
    assert.match(body.stack, /Error:/)
  }
}
console.log(`${checked} rendered pages include a CSP-authorized reporter; built reporters send at most five JSON POSTs`)
