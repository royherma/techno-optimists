import { afterEach, beforeEach, expect, it } from 'vitest'
import { takeQuota } from '../src/rate-limit'
import { hashToken } from '../src/auth'
import { sqliteD1 } from './helpers/sqlite-d1'

let f: ReturnType<typeof sqliteD1>
beforeEach(() => { f = sqliteD1('schema.sql', 'community.sql') })
afterEach(() => f.sqlite.close())

it('allows exactly the configured number of concurrent reservations', async () => {
  const results = await Promise.all(Array.from({ length: 100 }, () => takeQuota(f.DB, 'test', 'person', 5, 60)))
  expect(results.filter(Boolean)).toHaveLength(5)
  expect(f.sqlite.prepare('SELECT count FROM request_limits').get()?.count).toBe(5)
})

it('resets an expired window without growing the number of stored counters', async () => {
  expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(true)
  expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(false)
  f.sqlite.exec('UPDATE request_limits SET expires_at = unixepoch() - 1')
  expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(true)
  expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(false)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM request_limits').get()?.n).toBe(1)
})

it('isolates actors and operation scopes and stores no raw address', async () => {
  expect(await takeQuota(f.DB, 'login', 'private@example.test', 1, 60)).toBe(true)
  expect(await takeQuota(f.DB, 'login', 'other@example.test', 1, 60)).toBe(true)
  expect(await takeQuota(f.DB, 'posting', 'private@example.test', 1, 60)).toBe(true)
  const rows = f.sqlite.prepare('SELECT * FROM request_limits').all()
  expect(rows).toHaveLength(3)
  expect(JSON.stringify(rows)).not.toContain('@example.test')
  expect(rows.some(r => r.key === 'private@example.test')).toBe(false)
})

it('does not extend the window when refusing a request', async () => {
  await takeQuota(f.DB, 'test', 'person', 1, 60)
  const key = await hashToken('test:person')
  const expiry = f.sqlite.prepare('SELECT expires_at FROM request_limits WHERE key=?').get(key)?.expires_at
  for (let i = 0; i < 3; i++) expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(false)
  expect(f.sqlite.prepare('SELECT expires_at FROM request_limits WHERE key=?').get(key)?.expires_at).toBe(expiry)
})

it('fails closed if the database fails', async () => {
  const db = { prepare() { throw new Error('database unavailable') } } as unknown as D1Database
  await expect(takeQuota(db, 'test', 'person', 1, 60)).rejects.toThrow('database unavailable')
})

it('keeps the additive migration repeatable without losing existing reservations', async () => {
  await takeQuota(f.DB, 'test', 'person', 1, 60)
  const { readFileSync } = await import('node:fs')
  f.sqlite.exec(readFileSync(new URL('../../../packages/db/community.sql', import.meta.url), 'utf8'))
  expect(await takeQuota(f.DB, 'test', 'person', 1, 60)).toBe(false)
})
