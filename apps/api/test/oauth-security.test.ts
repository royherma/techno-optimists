import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { hashToken } from '../src/auth'
import { sqliteD1 } from './helpers/sqlite-d1'

let db: ReturnType<typeof sqliteD1>
beforeEach(async () => {
  db = sqliteD1('schema.sql', 'community.sql')
  db.sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('attacker','attacker','Attacker'),('donor','donor','Donor')")
  for (const person of ['attacker', 'donor']) {
    db.sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?,?,?)')
      .run(await hashToken(person), person, '2099-01-01')
  }
  db.sqlite.exec("INSERT INTO ai_oauth_attempts(state,person_id,provider,verifier,next,expires_at) VALUES ('state','attacker','openrouter','verifier','/settings','2099-01-01')")
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ key: 'test-provider-key' })))
})
afterEach(() => { db.sqlite.close(); vi.unstubAllGlobals() })

it.each([undefined, 'donor'])('refuses a forwarded authorization callback with session %s before consuming or exchanging it', async (person) => {
  const response = await app.request('/api/ai/callback?state=state&code=donor-code', {
    headers: person ? { cookie: `to_session=${person}` } : {},
  }, { DB: db.DB, AI_KEY_SECRET: 'test-encryption-secret' })
  expect(response.headers.get('location')).toContain('ai_error=session_mismatch')
  expect(fetch).not.toHaveBeenCalled()
  expect(db.sqlite.prepare('SELECT used_at FROM ai_oauth_attempts').get()?.used_at).toBeNull()
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM ai_accounts').get()?.n).toBe(0)
})

it('allows the initiating account to finish its own authorization once', async () => {
  const request = () => app.request('/api/ai/callback?state=state&code=own-code', {
    headers: { cookie: 'to_session=attacker' },
  }, { DB: db.DB, AI_KEY_SECRET: 'test-encryption-secret' })
  expect((await request()).headers.get('location')).toBe('/settings?connected=1')
  expect((await request()).headers.get('location')).toBe('/settings?connected=1')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(db.sqlite.prepare('SELECT person_id FROM ai_accounts').get()?.person_id).toBe('attacker')
})
