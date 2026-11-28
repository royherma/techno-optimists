import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => {
  f = await securityFixture()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No external calls allowed') }))
})
afterEach(() => { f.sqlite.close(); vi.unstubAllGlobals() })
const writes: [string, string, unknown][] = [
  ['POST', '/api/challenges', { type: 'problem', title: 'A real problem', summary: 'Some real context' }],
  ['POST', '/api/challenges/import', { author: 'reader', challenges: [] }],
  ['POST', '/api/challenges/pond/updates', { body: 'Update' }],
  ['POST', '/api/challenges/pond/action', { kind: 'follow' }],
  ['POST', '/api/challenges/pond/comments', { body: 'Hello', request_id: '00000000-0000-4000-8000-000000000000' }],
  ['PATCH', '/api/challenges/pond/editorial', { title: 'New thread title' }],
  ['PUT', '/api/uploads', {}],
  ['PATCH', '/api/people/me', { name: 'Changed' }],
  ['POST', '/api/ai/disconnect', {}],
  ['POST', '/api/challenges/pond/ai/draft', {}],
  ['POST', '/api/ai/runs/run/published', { comment_id: 'comment' }],
  ['POST', '/api/prizes/enrich', {}],
  ['POST', '/api/scout/run', {}],
]

it.each(writes)('requires a valid session for %s %s', async (method, path, body) => {
  for (const cookie of ['', 'to_session=forged', `to_session=${f.token}`]) {
    if (cookie.endsWith(f.token)) f.sqlite.exec("UPDATE sessions SET expires_at='2000-01-01' WHERE person_id='p1'")
    const r = await app.request(path, { method, headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) }, { DB: f.DB })
    expect(r.status).toBe(401)
  }
  expect(fetch).not.toHaveBeenCalled()
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM request_limits').get()?.n).toBe(0)
})

it.each([
  ['POST', '/api/challenges/import', {}],
  ['PATCH', '/api/challenges/pond/editorial', { title: 'New thread title' }],
  ['POST', '/api/prizes/enrich', {}],
  ['POST', '/api/scout/run', {}],
])('does not trust cached admin flags at %s %s', async (method, path, body) => {
  f.sqlite.exec("UPDATE identities SET is_admin=1 WHERE person_id='p1'")
  const r = await app.request(String(path), { method: String(method), headers: f.headers, body: JSON.stringify(body) }, { DB: f.DB })
  expect(r.status).toBe(403)
  expect(f.sqlite.prepare("SELECT is_admin FROM identities WHERE person_id='p1'").get()?.is_admin).toBe(0)
  expect(fetch).not.toHaveBeenCalled()
})

it('never lets an ordinary account edit another person or elevate itself through profile fields', async () => {
  const r = await app.request('/api/people/me', {
    method: 'PATCH', headers: f.headers,
    body: JSON.stringify({ id: 'p2', email: 'admin@example.test', is_admin: true, name: 'Own name only' }),
  }, { DB: f.DB, ADMIN_EMAILS: 'admin@example.test' })
  expect(r.status).toBe(200)
  expect(f.sqlite.prepare("SELECT name FROM people WHERE id='p1'").get()?.name).toBe('Own name only')
  expect(f.sqlite.prepare("SELECT name FROM people WHERE id='p2'").get()?.name).toBe('Other Private')
  expect(f.sqlite.prepare("SELECT email,is_admin FROM identities WHERE person_id='p1'").get()).toMatchObject({ email: 'reader@example.test', is_admin: 0 })
})

it('does not let one author publish another author’s AI run', async () => {
  f.sqlite.exec("INSERT INTO ai_runs(id,challenge_id,person_id,action,model,output) VALUES ('run','c1','p2','draft','test','Draft'); INSERT INTO challenge_comments(id,challenge_id,author_id,body,request_id) VALUES ('comment','c1','p1','Comment','request')")
  const r = await app.request('/api/ai/runs/run/published', { method: 'POST', headers: f.headers, body: JSON.stringify({ comment_id: 'comment' }) }, { DB: f.DB })
  expect(await r.json()).toEqual({ ok: false })
  expect(f.sqlite.prepare('SELECT published_comment_id FROM ai_runs').get()?.published_comment_id).toBeNull()
})

it('does not let one author attach their run to somebody else’s comment', async () => {
  f.sqlite.exec("INSERT INTO ai_runs(id,challenge_id,person_id,action,model,output) VALUES ('run','c1','p1','draft','test','Draft'); INSERT INTO challenge_comments(id,challenge_id,author_id,body,request_id) VALUES ('comment','c1','p2','Comment','request')")
  const r = await app.request('/api/ai/runs/run/published', { method: 'POST', headers: f.headers, body: JSON.stringify({ comment_id: 'comment' }) }, { DB: f.DB })
  expect(await r.json()).toEqual({ ok: false })
  expect(f.sqlite.prepare('SELECT published_comment_id FROM ai_runs').get()?.published_comment_id).toBeNull()
})
