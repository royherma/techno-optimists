import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => {
  f = await securityFixture()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response('mail failed', { status: 503 })))
})
afterEach(() => { f.sqlite.close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const request = (host: string, env: Record<string, string> = {}) => app.request(`${host}/api/auth/request`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'reader@example.test' }),
}, { DB: f.DB, ...env })

it.each([{}, { ENVIRONMENT: 'dev' }, { ENVIRONMENT: 'prod' }])('fails closed on a public host without mail configuration %j', async (env) => {
  const r = await request('https://site.test', env)
  expect(r.status).toBe(503)
  expect(await r.text()).not.toContain('dev_link')
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM magic_links').get()?.n).toBe(0)
  expect(console.log).not.toHaveBeenCalled()
})

it('never logs a bearer link when the production mail service fails', async () => {
  const r = await request('https://site.test', { ENVIRONMENT: 'prod', RESEND_API_KEY: 'test-mail-key' })
  expect(r.status).toBe(503)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('token=')
})

it('keeps local development explicit and does not log its bearer link', async () => {
  const r = await request('http://localhost', { ENVIRONMENT: 'dev' })
  expect(r.status).toBe(200)
  expect((await r.json()).dev_link).toContain('/api/auth/callback?token=')
  expect(console.log).not.toHaveBeenCalled()
})
