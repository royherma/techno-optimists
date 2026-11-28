import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => { db.sqlite.close(); vi.unstubAllGlobals() })

it.each([undefined, 'p2'])('rejects OAuth completion from a different browser account (%s)', async (person) => {
  db.sqlite.exec("INSERT INTO ai_oauth_attempts(state,person_id,provider,verifier,expires_at) VALUES ('state','p1','openrouter','verifier','2099-01-01')")
  const exchange = vi.fn(async () => Response.json({ key: 'test-provider-key' }))
  vi.stubGlobal('fetch', exchange)
  const response = await app.request('/api/ai/callback?state=state&code=code', {
    headers: person ? { cookie: `to_session=${person}` } : {},
  }, { DB: db.DB, AI_KEY_SECRET: 'test-only' })
  expect(response.headers.get('location')).toContain('ai_error=session_mismatch')
  expect(exchange).not.toHaveBeenCalled()
  expect(db.sqlite.prepare('SELECT used_at FROM ai_oauth_attempts').get()?.used_at).toBeNull()
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM ai_accounts').get()?.n).toBe(0)
})

it('allows the initiating account to connect exactly once', async () => {
  db.sqlite.exec("INSERT INTO ai_oauth_attempts(state,person_id,provider,verifier,expires_at) VALUES ('state','p1','openrouter','verifier','2099-01-01')")
  const exchange = vi.fn(async () => Response.json({ key: 'test-provider-key' }))
  vi.stubGlobal('fetch', exchange)
  for (let i = 0; i < 2; i++) {
    const response = await app.request('/api/ai/callback?state=state&code=code', {
      headers: { cookie: 'to_session=p1' },
    }, { DB: db.DB, AI_KEY_SECRET: 'test-only' })
    expect(response.headers.get('location')).toContain('connected=1')
  }
  expect(exchange).toHaveBeenCalledTimes(1)
  const row = db.sqlite.prepare('SELECT person_id,key_encrypted FROM ai_accounts').get()!
  expect(row.person_id).toBe('p1')
  expect(row.key_encrypted).not.toContain('test-provider-key')
})
