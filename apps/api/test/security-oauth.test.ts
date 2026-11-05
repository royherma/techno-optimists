import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { decryptKey } from '../src/ai-accounts'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
const secret = { AI_KEY_SECRET: 'test-only-secret' }
beforeEach(async () => {
  f = await securityFixture()
  f.sqlite.prepare('INSERT INTO ai_oauth_attempts(state,person_id,provider,verifier,next,expires_at) VALUES (?,?,?,?,?,?)')
    .run('attacker-state', 'p1', 'openrouter', 'verifier', '/settings#compute', '2099-01-01')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ key: 'victim-paid-key' })))
})
afterEach(() => { f.sqlite.close(); vi.unstubAllGlobals() })

it.each([null, 'other'])('refuses to bind a donor key to another browser account (%s)', async (caller) => {
  const r = await app.request('https://site.test/api/ai/callback?state=attacker-state&code=donor-code', {
    headers: caller ? { cookie: `to_session=${f.otherToken}` } : {},
  }, { DB: f.DB, ...secret })
  expect(r.headers.get('location')).toContain('ai_error=session')
  expect(fetch).not.toHaveBeenCalled()
  expect(f.sqlite.prepare('SELECT used_at FROM ai_oauth_attempts').get()?.used_at).toBeNull()
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM ai_accounts').get()?.n).toBe(0)
})

it('allows the account that started the flow to connect once', async () => {
  const request = () => app.request('https://site.test/api/ai/callback?state=attacker-state&code=donor-code', { headers: f.headers }, { DB: f.DB, ...secret })
  expect((await request()).headers.get('location')).toBe('/settings?connected=1#compute')
  const row = f.sqlite.prepare('SELECT person_id,key_encrypted FROM ai_accounts').get()!
  expect(row.person_id).toBe('p1')
  expect(await decryptKey(secret, String(row.key_encrypted))).toBe('victim-paid-key')
  await request()
  expect(fetch).toHaveBeenCalledTimes(1)
})
