import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb(); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks() })
const request = (path: string, body: unknown) => app.request(path, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: 'to_session=p1' },
  body: JSON.stringify(body),
}, { DB: db.DB })

it.each([
  ['/api/challenges', { title: 'A problem worth solving', summary: 'Some useful context', type: 'problem' }, 5],
  ['/api/challenges/one/updates', { body: 'An update' }, 10],
  ['/api/challenges/one/action', { kind: 'follow' }, 30],
] as const)('bounds writes to %s', async (path, body, limit) => {
  for (let i = 0; i < limit; i++) expect((await request(path, body)).status).toBeLessThan(300)
  expect((await request(path, body)).status).toBe(429)
})

it('enforces the comment quota even for simultaneous requests', async () => {
  const originalPrepare = db.DB.prepare.bind(db.DB)
  let arrivals = 0
  let release: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  db.DB.prepare = ((sql: string) => {
    const statement = originalPrepare(sql)
    if (sql.startsWith('SELECT COUNT(*) n FROM challenge_comments WHERE author_id')) {
      const first = statement.first.bind(statement)
      statement.first = (async () => {
        const result = await first()
        if (++arrivals === 12) release()
        await barrier
        return result
      }) as typeof statement.first
    }
    return statement
  }) as typeof db.DB.prepare
  const responses = await Promise.all(Array.from({ length: 12 }, () => request('/api/challenges/one/comments', {
    body: 'A useful response', request_id: crypto.randomUUID(),
  })))
  expect(responses.filter(r => r.status === 201)).toHaveLength(5)
  expect(responses.filter(r => r.status === 429)).toHaveLength(7)
  expect(db.sqlite.prepare('SELECT COUNT(*) n FROM challenge_comments').get()?.n).toBe(5)
})

it('bounds uploads before writing more objects', async () => {
  const put = vi.fn(async () => ({ size: 3 }))
  const upload = () => app.request('/api/uploads', {
    method: 'PUT', headers: { 'content-type': 'image/png', cookie: 'to_session=p1' }, body: 'png',
  }, { DB: db.DB, MEDIA: { put } as unknown as R2Bucket })
  for (let i = 0; i < 10; i++) expect((await upload()).status).toBe(200)
  expect((await upload()).status).toBe(429)
  expect(put).toHaveBeenCalledTimes(10)
})
