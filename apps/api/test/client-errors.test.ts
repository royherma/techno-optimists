import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'

const stubDb = () => ({
  prepare: () => ({ bind: function () { return this }, all: async () => ({ results: [] }), first: async () => null }),
  batch: async () => [],
}) as unknown as D1Database

const post = (body: unknown, headers: Record<string, string> = {}, env: Record<string, unknown> = {}) =>
  app.request('/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, { DB: stubDb(), ...env })

const validBody = {
  message: 'boom',
  stack: 'Error: boom\n  at x',
  url: 'https://technooptimists.org/threads/pond?type=idea',
  ua: 'Mozilla/5.0 (iPhone)',
}

const loggedLines = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>)

afterEach(() => vi.restoreAllMocks())

describe('POST /api/client-errors', () => {
  it('accepts a well-formed report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await post(validBody)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('refuses a cross-site report', async () => {
    const r = await post(validBody, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
  })

  it('400s a body missing the required message', async () => {
    const { message: _, ...rest } = validBody
    expect((await post(rest)).status).toBe(400)
  })

  it('400s a body missing the page url', async () => {
    const { url: _, ...rest } = validBody
    expect((await post(rest)).status).toBe(400)
  })

  it('400s a url that is not a url', async () => {
    expect((await post({ ...validBody, url: 'not a url' })).status).toBe(400)
  })

  it('400s a body with an unknown field', async () => {
    expect((await post({ ...validBody, extra: 'nope' })).status).toBe(400)
  })

  it('400s a body that is not JSON', async () => {
    const r = await app.request('/api/client-errors', { method: 'POST', body: 'boom' }, { DB: stubDb() })
    expect(r.status).toBe(400)
  })

  it('413s a report over the body cap', async () => {
    expect((await post({ ...validBody, stack: 'x'.repeat(20_000) })).status).toBe(413)
  })

  it('logs one line tagged source: browser with message, stack, url and ua', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await post(validBody, { 'cf-ray': 'abc123-SIN' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(loggedLines(spy)[0]).toEqual({
      level: 'error',
      source: 'browser',
      ray: 'abc123-SIN',
      method: 'POST',
      path: '/threads/pond',
      url: validBody.url,
      ua: validBody.ua,
      message: 'boom',
      stack: validBody.stack,
    })
  })

  it('falls back to the request user-agent when the report has none', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ua: _, ...rest } = validBody
    await post(rest, { 'user-agent': 'HeaderUA/1.0' })
    expect(loggedLines(spy)[0].ua).toBe('HeaderUA/1.0')
  })

  it('shares the log path with app.onError, which tags source: server', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwingDb = { prepare: () => { throw new Error('D1_ERROR: down') } } as unknown as D1Database
    const r = await app.request('/api/health', { headers: { 'cf-ray': 'srv-1' } }, { DB: throwingDb })
    expect(r.status).toBe(500)
    await post(validBody, { 'cf-ray': 'brw-1' })

    const [server, browser] = loggedLines(spy)
    expect(server).toMatchObject({ level: 'error', source: 'server', ray: 'srv-1', path: '/api/health' })
    expect(browser).toMatchObject({ level: 'error', source: 'browser', ray: 'brw-1', path: '/threads/pond' })
    expect(Object.keys(browser).slice(0, 5)).toEqual(Object.keys(server).slice(0, 5))
  })

  it('writes a point to the Analytics Engine dataset via track()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: unknown[] = []
    const r = await post(validBody, {}, { ANALYTICS: { writeDataPoint: (p: unknown) => seen.push(p) } })
    expect(r.status).toBe(200)
    expect(seen).toHaveLength(1)
    const p = seen[0] as { blobs: string[]; indexes: string[] }
    expect(p.blobs[0]).toBe('/threads/pond')
    expect(p.blobs[1]).toBe('client_error')
    expect(p.indexes).toEqual(['client_error'])
  })

  it('never breaks the request when the dataset throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await post(validBody, {}, { ANALYTICS: { writeDataPoint: () => { throw new Error('AE down') } } })
    expect(r.status).toBe(200)
  })
})

describe('browser error reporter', () => {
  type Listener = (event: unknown) => void

  const loadReporter = async () => {
    vi.resetModules()
    const listeners: Record<string, Listener> = {}
    const beacons: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('window', { addEventListener: (type: string, fn: Listener) => { listeners[type] = fn } })
    vi.stubGlobal('location', { origin: 'https://technooptimists.org', pathname: '/threads/pond', search: '?type=idea' })
    vi.stubGlobal('navigator', {
      userAgent: 'TestUA/1.0',
      sendBeacon: (url: string, blob: Blob) => {
        void blob.text().then((t) => beacons.push({ url, body: JSON.parse(t) }))
        return true
      },
    })
    await import('../../web/src/lib/error-reporter')
    return { listeners, beacons }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('reports an uncaught error as {message, stack, url, ua} to the route', async () => {
    const { listeners, beacons } = await loadReporter()
    listeners.error({ message: 'Uncaught TypeError: x is undefined', error: new TypeError('x is undefined') })
    await vi.waitFor(() => expect(beacons).toHaveLength(1))
    expect(beacons[0].url).toBe('/api/client-errors')
    expect(Object.keys(beacons[0].body).sort()).toEqual(['message', 'stack', 'ua', 'url'])
    expect(beacons[0].body).toMatchObject({
      message: 'Uncaught TypeError: x is undefined',
      url: 'https://technooptimists.org/threads/pond?type=idea',
      ua: 'TestUA/1.0',
    })
    expect(beacons[0].body.stack).toContain('TypeError')
  })

  it('reports an unhandled rejection', async () => {
    const { listeners, beacons } = await loadReporter()
    listeners.unhandledrejection({ reason: 'plain string reason' })
    await vi.waitFor(() => expect(beacons).toHaveLength(1))
    expect(beacons[0].body).toMatchObject({ message: 'plain string reason', stack: '' })
  })

  it('points at the script location when the error has no stack', async () => {
    const { listeners, beacons } = await loadReporter()
    listeners.error({ message: 'Script error.', filename: 'https://technooptimists.org/_astro/a.js', lineno: 3, colno: 9 })
    await vi.waitFor(() => expect(beacons).toHaveLength(1))
    expect(beacons[0].body.stack).toBe('at https://technooptimists.org/_astro/a.js:3:9')
  })

  it('sends at most 5 reports per page load', async () => {
    const { listeners, beacons } = await loadReporter()
    for (let i = 0; i < 12; i++) {
      listeners[i % 2 ? 'error' : 'unhandledrejection'](i % 2 ? { message: `e${i}`, error: new Error(`e${i}`) } : { reason: new Error(`r${i}`) })
    }
    await vi.waitFor(() => expect(beacons).toHaveLength(5))
    await new Promise((r) => setTimeout(r, 20))
    expect(beacons).toHaveLength(5)
  })

  it('every report it builds passes the route validation', async () => {
    const { listeners, beacons } = await loadReporter()
    listeners.error({ message: 'x'.repeat(5000), error: Object.assign(new Error('big'), { stack: 'y'.repeat(50_000) }) })
    await vi.waitFor(() => expect(beacons).toHaveLength(1))
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post(beacons[0].body)).status).toBe(200)
  })
})


describe('browser error transport failures', () => {
  type Listener = (event: unknown) => void

  const loadReporter = async (sendBeacon?: ReturnType<typeof vi.fn>) => {
    vi.resetModules()
    const listeners: Record<string, Listener> = {}
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('window', { addEventListener: (type: string, fn: Listener) => { listeners[type] = fn } })
    vi.stubGlobal('location', { origin: 'https://technooptimists.org', pathname: '/c/pond', search: '' })
    vi.stubGlobal('navigator', { userAgent: 'TestUA', sendBeacon })
    vi.stubGlobal('fetch', fetch)
    await import('../../web/src/lib/error-reporter')
    return { listeners, fetch }
  }

  afterEach(() => vi.unstubAllGlobals())

  it.each(['missing', 'full', 'throwing'])('uses a JSON POST when beacon is %s', async (mode) => {
    const beacon = mode === 'missing' ? undefined : vi.fn(() => {
      if (mode === 'throwing') throw new Error('beacon unavailable')
      return false
    })
    const { listeners, fetch } = await loadReporter(beacon)
    listeners.error({ message: 'boom', error: new Error('boom') })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [endpoint, request] = fetch.mock.calls[0]
    expect(endpoint).toBe('/api/client-errors')
    expect(request).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true })
    expect(JSON.parse(request.body)).toMatchObject({ message: 'boom', url: 'https://technooptimists.org/c/pond', ua: 'TestUA' })
  })

  it('does not send twice when the beacon accepts a report', async () => {
    const beacon = vi.fn(() => true)
    const { listeners, fetch } = await loadReporter(beacon)
    listeners.error({ message: 'boom' })
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['reject', 'throw'])('contains fetch failures (%s) and still caps attempts at five', async (mode) => {
    const { listeners, fetch } = await loadReporter()
    if (mode === 'reject') fetch.mockRejectedValue(new Error('offline'))
    else fetch.mockImplementation(() => { throw new Error('offline') })
    for (let i = 0; i < 12; i++) {
      expect(() => listeners.unhandledrejection({ reason: new Error('boom') })).not.toThrow()
    }
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('handles rejection values that cannot be converted to strings', async () => {
    const { listeners, fetch } = await loadReporter()
    expect(() => listeners.unhandledrejection({ reason: Object.create(null) })).not.toThrow()
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ message: 'Unknown rejection', stack: '' })
  })

  it('delivers both event types through fetch to the Worker with one shared five-report budget', async () => {
    const { listeners, fetch } = await loadReporter()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const requests: Promise<Response>[] = []
    fetch.mockImplementation((url: string, init: RequestInit) => {
      const { keepalive, ...incoming } = init
      expect(keepalive).toBe(true)
      // keepalive controls the browser connection; it is not transmitted to the Worker.
      const response = app.request(url, incoming, { DB: stubDb() })
      const pending = Promise.resolve(response)
      requests.push(pending)
      return pending
    })
    for (let i = 0; i < 8; i++) {
      if (i % 2) listeners.error({ message: `error ${i}`, error: new Error(`error ${i}`) })
      else listeners.unhandledrejection({ reason: new Error(`rejection ${i}`) })
    }
    const responses = await Promise.all(requests)
    expect(responses.map((response) => response.status), JSON.stringify(loggedLines(log))).toEqual([200, 200, 200, 200, 200])
    expect(loggedLines(log).map((line) => line.message)).toEqual(['rejection 0', 'error 1', 'rejection 2', 'error 3', 'rejection 4'])
    for (const line of loggedLines(log)) {
      expect(line).toMatchObject({ level: 'error', source: 'browser', path: '/c/pond', ua: 'TestUA' })
      expect(line.stack).toContain('Error:')
    }
  })

  it('keeps long URLs and escaped Unicode reports within the route limits', async () => {
    const { listeners, fetch } = await loadReporter()
    vi.stubGlobal('location', { origin: 'https://technooptimists.org', pathname: '/c/pond', search: '?q=' + 'x'.repeat(5000) })
    vi.stubGlobal('navigator', { userAgent: '\u0001'.repeat(400) })
    listeners.error({ message: '\u0001'.repeat(500), error: Object.assign(new Error('boom'), { stack: '漢\u0001'.repeat(1000) }) })
    const body = fetch.mock.calls[0][1].body
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(8000)
    expect(JSON.parse(body).url).toHaveLength(1000)
    vi.unstubAllGlobals()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post(JSON.parse(body))).status).toBe(200)
    expect(loggedLines(spy)[0].source).toBe('browser')
  })
})
