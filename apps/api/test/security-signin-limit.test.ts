import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => { db.sqlite.close(); vi.unstubAllGlobals() })
const request = (email: string) => app.request('/api/auth/request', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
  body: JSON.stringify({ email }),
}, { DB: db.DB, ENVIRONMENT: 'prod', RESEND_API_KEY: 'test-only' })

it('atomically enforces the five-link email quota under concurrency', async () => {
  const send = vi.fn(async () => Response.json({ id: 'mail' }))
  vi.stubGlobal('fetch', send)
  const responses = await Promise.all(Array.from({ length: 20 }, () => request('reader@example.test')))
  expect(responses.filter(r => r.status === 200)).toHaveLength(5)
  expect(responses.filter(r => r.status === 429)).toHaveLength(15)
  expect(send).toHaveBeenCalledTimes(5)
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM magic_links').get()?.n).toBe(5)
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM magic_links WHERE used_at IS NULL').get()?.n).toBe(1)
})

it('atomically enforces the IP quota across different addresses', async () => {
  const send = vi.fn(async () => Response.json({ id: 'mail' }))
  vi.stubGlobal('fetch', send)
  const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => request(`reader${i}@example.test`)))
  expect(responses.filter(r => r.status === 200)).toHaveLength(20)
  expect(responses.filter(r => r.status === 429)).toHaveLength(10)
  expect(send).toHaveBeenCalledTimes(20)
})
