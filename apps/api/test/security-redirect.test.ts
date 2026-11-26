import { afterEach, beforeEach, expect, it } from 'vitest'
import { app } from '../src/index'
import { hashToken } from '../src/auth'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => db.sqlite.close())

it.each(['/\\evil.test', '/\t/evil.test', '//evil.test', 'https://evil.test'])('keeps a magic link redirect on site: %j', async (next) => {
  db.sqlite.prepare('INSERT INTO magic_links(token_hash,email,expires_at) VALUES (?,?,?)')
    .run(await hashToken('link'), 'reader@example.test', '2099-01-01')
  const response = await app.request(`/api/auth/callback?token=link&next=${encodeURIComponent(next)}`, {}, { DB: db.DB })
  expect(response.headers.get('location')).toBe('/')
})

it('preserves a legitimate path, query and fragment', async () => {
  db.sqlite.prepare('INSERT INTO magic_links(token_hash,email,expires_at) VALUES (?,?,?)')
    .run(await hashToken('link'), 'reader@example.test', '2099-01-01')
  const next = '/settings?tab=profile#details'
  const response = await app.request(`/api/auth/callback?token=link&next=${encodeURIComponent(next)}`, {}, { DB: db.DB })
  expect(response.headers.get('location')).toBe(next)
})
