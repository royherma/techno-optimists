import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { hashToken } from '../src/auth'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => { f.sqlite.close(); vi.unstubAllGlobals() })
const token = 'd'.repeat(64)

it('does not let a shared magic link sign a different browser into the sender account', async () => {
  f.sqlite.prepare('INSERT INTO magic_links(token_hash,email,expires_at) VALUES (?,?,?)')
    .run(await hashToken(token), 'reader@example.test', '2099-01-01')
  const r = await app.request(`https://site.test/api/auth/callback?token=${token}`, { headers: { cookie: `to_session=${f.otherToken}` } }, { DB: f.DB })
  expect(r.headers.get('location')).toBe('/signin?error=browser')
  expect(r.headers.get('set-cookie')).toBeNull()
  expect(f.sqlite.prepare('SELECT used_at FROM magic_links').get()?.used_at).toBeNull()
})

it('binds the emailed login to the requesting browser and clears that binding on success', async () => {
  let emailedLink = ''
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    emailedLink = JSON.parse(String(init?.body)).text.match(/https:\/\/\S+/)[0]
    return Response.json({ id: 'test-mail' })
  }))
  const requested = await app.request('https://site.test/api/auth/request', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.test' }, body: JSON.stringify({ email: 'reader@example.test' }),
  }, { DB: f.DB, ENVIRONMENT: 'prod', RESEND_API_KEY: 'test-mail-key' })
  const binding = requested.headers.get('set-cookie')
  expect(binding).toContain('__Host-to_login=')
  expect(binding).toContain('HttpOnly')
  expect(binding).toContain('Secure')
  const r = await app.request(emailedLink, { headers: { cookie: binding!.split(';')[0] } }, { DB: f.DB })
  expect(r.headers.get('location')).toBe('/')
  expect(r.headers.get('set-cookie')).toContain('to_session=')
  expect(r.headers.get('set-cookie')).toContain('__Host-to_login=;')
})

it.each(['/api/auth/request', '/api/auth/signout', '/api/ai/disconnect', '/api/challenges', '/api/uploads', '/api/scout/run'])('rejects cross-origin mutations before accessing credentials at %s', async path => {
  const r = await app.request('https://site.test' + path, {
    method: path === '/api/uploads' ? 'PUT' : 'POST',
    headers: { origin: 'https://evil.site.test', 'content-type': 'text/plain', cookie: `to_session=${f.token}` }, body: '{}',
  }, { DB: f.DB })
  expect(r.status).toBe(403)
})
