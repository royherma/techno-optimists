import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => f.sqlite.close())
const post = (path: string, body: unknown) => app.request(path, {
  method: 'POST', headers: f.headers, body: JSON.stringify(body),
}, { DB: f.DB })

it('limits thread creation per account', async () => {
  for (let i = 0; i < 5; i++) {
    expect((await post('/api/challenges', { type: 'problem', title: `Pond problem ${i}`, summary: 'A pond needs some help' })).status).toBe(201)
  }
  expect((await post('/api/challenges', { type: 'problem', title: 'One more problem', summary: 'A pond needs some help' })).status).toBe(429)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM challenges').get()?.n).toBe(6)
})

it('limits progress updates without changing a thread after refusal', async () => {
  for (let i = 0; i < 20; i++) expect((await post('/api/challenges/pond/updates', { body: 'Progress' })).status).toBe(201)
  expect((await post('/api/challenges/pond/updates', { body: 'Spam', stage: 'improve' })).status).toBe(429)
  expect(f.sqlite.prepare('SELECT stage FROM challenges').get()?.stage).toBe('spot')
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM updates').get()?.n).toBe(20)
})

it('limits uploads before sending more bytes to R2', async () => {
  const put = vi.fn(async () => ({ size: 1 }))
  const upload = () => app.request('/api/uploads', { method: 'PUT', headers: { ...f.headers, 'content-type': 'image/png' }, body: new Uint8Array([1]) }, { DB: f.DB, MEDIA: { put } as unknown as R2Bucket })
  for (let i = 0; i < 10; i++) expect((await upload()).status).toBe(200)
  expect((await upload()).status).toBe(429)
  expect(put).toHaveBeenCalledTimes(10)
})

it('does not let simultaneous comments bypass the five per minute limit', async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, () => post('/api/challenges/pond/comments', { body: 'A comment', request_id: crypto.randomUUID() })))
  expect(responses.filter(r => r.status === 201)).toHaveLength(5)
  expect(responses.filter(r => r.status === 429)).toHaveLength(7)
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM challenge_comments').get()?.n).toBe(5)
})

it('bounds reaction churn as well as new content', async () => {
  for (let i = 0; i < 60; i++) expect((await post('/api/challenges/pond/action', { kind: 'follow', active: i % 2 === 0 })).status).toBe(200)
  expect((await post('/api/challenges/pond/action', { kind: 'follow' })).status).toBe(429)
})
