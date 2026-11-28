import { afterEach, beforeEach, expect, it } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => f.sqlite.close())
const payload = "x' OR 1=1; DROP TABLE people; --"

it.each([
  '/api/challenges/' + encodeURIComponent(payload),
  '/api/challenges/' + encodeURIComponent(payload) + '/comments',
  '/api/people/' + encodeURIComponent(payload),
  '/api/people/' + encodeURIComponent(payload) + '/contributions',
  '/api/comments/' + encodeURIComponent(payload) + '/original',
])('treats path SQL metacharacters as a bound value at %s', async path => {
  expect((await app.request(path, {}, { DB: f.DB })).status).toBe(404)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM people').get()?.n).toBe(2)
})

it('rejects sort and pagination syntax instead of interpolating them into SQL', async () => {
  for (const query of [`sort=${encodeURIComponent(payload)}`, `limit=${encodeURIComponent(payload)}`, `offset=${encodeURIComponent(payload)}`]) {
    expect((await app.request('/api/challenges?' + query, {}, { DB: f.DB })).status).toBe(400)
  }
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM challenges').get()?.n).toBe(1)
})

it('binds tag filters and returns no unrelated rows for SQL text', async () => {
  const r = await app.request('/api/challenges?tag=' + encodeURIComponent(payload), {}, { DB: f.DB })
  expect(r.status).toBe(200)
  expect((await r.json()).challenges).toEqual([])
})

it('stores profile SQL text literally while scoping the update to the current account', async () => {
  const r = await app.request('/api/people/me', { method: 'PATCH', headers: f.headers, body: JSON.stringify({ name: payload, location: payload }) }, { DB: f.DB })
  expect(r.status).toBe(200)
  expect(f.sqlite.prepare("SELECT name,location FROM people WHERE id='p1'").get()).toEqual({ name: payload, location: payload })
  expect(f.sqlite.prepare("SELECT name FROM people WHERE id='p2'").get()?.name).toBe('Other Private')
})

it('does not let even an admin introduce a SQL column through editorial object keys', async () => {
  const r = await app.request('/api/challenges/pond/editorial', { method: 'PATCH', headers: f.headers, body: JSON.stringify({ title: 'A safe new title', ["author_id = 'p2', title"]: 'Injected' }) }, { DB: f.DB, ADMIN_EMAILS: 'reader@example.test' })
  expect(r.status).toBe(400)
  expect(f.sqlite.prepare('SELECT title,author_id FROM challenges').get()).toEqual({ title: 'A pond problem', author_id: 'p1' })
})

it('stores comment text as data and does not let a foreign parent id escape its thread', async () => {
  const created = await app.request('/api/challenges/pond/comments', { method: 'POST', headers: f.headers, body: JSON.stringify({ body: payload, request_id: crypto.randomUUID() }) }, { DB: f.DB })
  expect(created.status).toBe(201)
  expect(f.sqlite.prepare('SELECT body FROM challenge_comments').get()?.body).toBe(payload)
  const rejected = await app.request('/api/challenges/pond/comments', { method: 'POST', headers: f.headers, body: JSON.stringify({ body: 'Child', parent_id: payload, request_id: crypto.randomUUID() }) }, { DB: f.DB })
  expect(rejected.status).toBe(400)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM challenge_comments').get()?.n).toBe(1)
})
