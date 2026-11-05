import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'

const report = { message: 'boom', stack: 'Error: boom', url: 'https://technooptimists.org/c/pond', ua: 'TestUA' }
const request = (body: unknown, headers: Record<string, string> = {}) => app.request(
  'https://technooptimists.org/api/client-errors',
  { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
  { DB: {} as D1Database },
)

afterEach(() => vi.restoreAllMocks())

describe('browser report route boundaries', () => {
  it.each([
    null, [], 'boom', 42,
    { ...report, message: '' },
    { ...report, message: '   ' },
    { ...report, message: 42 },
    { ...report, message: 'x'.repeat(501) },
    { ...report, stack: null },
    { ...report, stack: 'x'.repeat(4001) },
    { ...report, url: 'https://example.com/' + 'x'.repeat(1000) },
    { ...report, ua: 'x'.repeat(401) },
    { ...report, source: 'server' },
  ])('rejects invalid reports without logging them: %j', async (body) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'bad_body' })
    expect(log).not.toHaveBeenCalled()
  })

  it('accepts same-origin reports at each field limit', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = { message: 'x'.repeat(500), stack: 'x'.repeat(4000), url: 'https://example.com/' + 'x'.repeat(980), ua: 'x'.repeat(400) }
    expect(body.url).toHaveLength(1000)
    expect((await request(body, { origin: 'https://technooptimists.org' })).status).toBe(200)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ ...body, source: 'browser', level: 'error', ray: 'no-ray' })
  })

  it('defaults optional values without requiring a database binding', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await request({ message: '  boom  ', url: report.url })).status).toBe(200)
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ message: 'boom', stack: '', ua: '', source: 'browser' })
  })

  it.each(['null', 'https://evil.example', 'https://technooptimists.org.evil.example'])('rejects origin %s without logging', async (origin) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request(report, { origin })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'bad_origin' })
    expect(log).not.toHaveBeenCalled()
  })

  it('bounds streamed bodies even without a content-length header', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"message":"' + 'x'.repeat(4000)))
        controller.enqueue(new TextEncoder().encode('x'.repeat(4001) + '"}'))
        controller.close()
      },
    })
    const req = new Request('https://technooptimists.org/api/client-errors', {
      method: 'POST', body, duplex: 'half',
    } as RequestInit)
    const response = await app.request(req, {}, { DB: {} as D1Database })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'body_too_large' })
    expect(log).not.toHaveBeenCalled()
  })
})
