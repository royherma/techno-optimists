import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([false, true])('never logs a production magic link when delivery fails (configured: %s)', async (configured) => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('rejected', { status: 503 })))
  const response = await app.request('/api/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.test' }),
  }, { DB: db.DB, ENVIRONMENT: 'prod', ...(configured ? { RESEND_API_KEY: 'test-only' } : {}) })
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/token=|reader@example.test/)
  expect(await response.text()).not.toContain('dev_link')
})
