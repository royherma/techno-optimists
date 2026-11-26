import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser error delivery to the Worker', () => {
  const load = async (transport: 'beacon' | 'fetch' | 'refused' | 'throws') => {
    vi.resetModules()
    const window = new EventTarget()
    const deliveries: Promise<Response>[] = []
    const deliver = (body: BodyInit) => app.request('https://technooptimists.org/api/client-errors', {
      method: 'POST', body, headers: { origin: 'https://technooptimists.org', 'cf-ray': 'browser-test' },
    })
    const fetch = vi.fn((_: string, init: RequestInit) => {
      const response = deliver(init.body!)
      deliveries.push(response)
      return response
    })
    vi.stubGlobal('window', window)
    vi.stubGlobal('location', {
      origin: 'https://technooptimists.org', pathname: '/c/pond',
      search: `?q=${'x'.repeat(2000)}`, hash: '#not-reported',
    })
    vi.stubGlobal('navigator', {
      userAgent: 'TestUA/1.0',
      sendBeacon: transport === 'fetch' ? undefined : (_: string, body: Blob) => {
        if (transport === 'throws') throw new Error('beacon blocked')
        if (transport === 'refused') return false
        deliveries.push(deliver(body))
        return true
      },
    })
    vi.stubGlobal('fetch', fetch)
    await import('../../web/src/lib/error-reporter')
    return { window, deliveries, fetch }
  }

  it.each(['beacon', 'fetch', 'refused', 'throws'] as const)('logs both browser event types through %s with one shared five-report budget', async (transport) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { window, deliveries, fetch } = await load(transport)
    for (let i = 0; i < 12; i++) {
      const message = `failure ${i} ${'界'.repeat(500)}`
      const error = Object.assign(new Error(message), { stack: '\u0000'.repeat(4000) })
      const event = i % 2
        ? Object.assign(new Event('error', { cancelable: true }), { message, error })
        : Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason: error })
      expect(window.dispatchEvent(event)).toBe(true)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(deliveries).toHaveLength(5)
    const responses = await Promise.all(deliveries)
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200])
    expect(await Promise.all(responses.map((r) => r.json()))).toEqual(Array(5).fill({ ok: true }))
    expect(fetch).toHaveBeenCalledTimes(transport === 'beacon' ? 0 : 5)
    expect(log).toHaveBeenCalledTimes(5)
    const lines = log.mock.calls.map(([line]) => JSON.parse(line))
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i]).toMatchObject({
        level: 'error', source: 'browser', ray: 'browser-test', method: 'POST',
        path: '/c/pond', ua: 'TestUA/1.0',
      })
      expect(lines[i].message).toBe(`failure ${i} ${'界'.repeat(500)}`.slice(0, 500))
      expect(lines[i].url).toHaveLength(1000)
      expect(lines[i].url).not.toContain('#')
      expect(lines[i].stack.length).toBeGreaterThan(0)
    }
  })

  it('starts a fresh report budget on the next page load', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (let page = 0; page < 2; page++) {
      const { window, deliveries } = await load('beacon')
      for (let i = 0; i < 7; i++) {
        window.dispatchEvent(Object.assign(new Event('error'), { message: 'boom' }))
      }
      expect(deliveries).toHaveLength(5)
      expect((await Promise.all(deliveries)).every((r) => r.status === 200)).toBe(true)
    }
    expect(log).toHaveBeenCalledTimes(10)
  })
})
