import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => {
  f = await securityFixture()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'test-message' })))
})
afterEach(() => { f.sqlite.close(); vi.unstubAllGlobals() })
const request = (email: string, ip: string) => app.request('https://site.test/api/auth/request', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ email }),
}, { DB: f.DB, ENVIRONMENT: 'prod', RESEND_API_KEY: 'test-key' })

it('reserves the per-address quota before concurrent mail sends', async () => {
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => request('reader@example.test', `192.0.2.${i}`)))
  expect(responses.filter(r => r.status === 200)).toHaveLength(5)
  expect(responses.filter(r => r.status === 429)).toHaveLength(5)
  expect(fetch).toHaveBeenCalledTimes(5)
})

it('reserves the per-IP quota across different addresses', async () => {
  const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => request(`reader${i}@example.test`, '192.0.2.1')))
  expect(responses.filter(r => r.status === 200)).toHaveLength(20)
  expect(responses.filter(r => r.status === 429)).toHaveLength(10)
  expect(fetch).toHaveBeenCalledTimes(20)
})
