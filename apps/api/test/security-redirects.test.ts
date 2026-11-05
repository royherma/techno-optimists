import { afterEach, beforeEach, expect, it } from 'vitest'
import { app } from '../src/index'
import { hashToken } from '../src/auth'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => f.sqlite.close())

it.each(['/\\evil.example/phish', '/\t/evil.example', '/\n/evil.example', '//evil.example'])('rejects an external redirect disguised as %j', async (next) => {
  const token = 'c'.repeat(64)
  f.sqlite.prepare('INSERT INTO magic_links(token_hash,email,expires_at) VALUES (?,?,?)')
    .run(await hashToken(token), 'reader@example.test', '2099-01-01')
  const r = await app.request(`https://site.test/api/auth/callback?token=${token}&next=${encodeURIComponent(next)}`, {}, { DB: f.DB })
  expect(r.headers.get('location')).toBe('/')
})

it('preserves a local path, query and fragment', async () => {
  const r = await app.request('https://site.test/api/ai/connect?next=' + encodeURIComponent('/c/pond?sort=new#discussion'), { headers: f.headers }, { DB: f.DB })
  expect(r.status).toBe(302)
  expect(f.sqlite.prepare('SELECT next FROM ai_oauth_attempts').get()?.next).toBe('/c/pond?sort=new#discussion')
})
