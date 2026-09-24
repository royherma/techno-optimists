import { describe, expect, it, vi } from 'vitest'
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

const validBody = { message: 'boom', source: '/app.js', line: 12, col: 4, stack: 'Error: boom\n  at x', path: '/threads/pond' }

describe('POST /api/client-errors', () => {
  it('accepts a well-formed report', async () => {
    const r = await post(validBody)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('refuses a cross-site report', async () => {
    const r = await post(validBody, { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
  })

  it('400s a body missing the required message', async () => {
    const r = await post({ path: '/x' })
    expect(r.status).toBe(400)
  })

  it('400s a body with an unknown field', async () => {
    const r = await post({ ...validBody, extra: 'nope' })
    expect(r.status).toBe(400)
  })

  it('413s a report over the body cap', async () => {
    const r = await post({ ...validBody, stack: 'x'.repeat(20_000) })
    expect(r.status).toBe(413)
  })

  it('logs the same structured shape app.onError uses, tagged kind: client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await post(validBody, { 'cf-ray': 'abc123-SIN' })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = JSON.parse(spy.mock.calls[0][0] as string)
    expect(line).toMatchObject({
      level: 'error', kind: 'client', ray: 'abc123-SIN', path: '/threads/pond', message: 'boom',
    })
    spy.mockRestore()
  })

  it('writes a point to the Analytics Engine dataset via track()', async () => {
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
    const r = await post(validBody, {}, { ANALYTICS: { writeDataPoint: () => { throw new Error('AE down') } } })
    expect(r.status).toBe(200)
  })
})
