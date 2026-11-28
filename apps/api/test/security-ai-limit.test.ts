import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { encryptKey } from '../src/ai-accounts'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => {
  db = await securityDb()
  db.sqlite.prepare('INSERT INTO ai_accounts(person_id,key_encrypted) VALUES (?,?)')
    .run('p1', await encryptKey({ AI_KEY_SECRET: 'test-only' }, 'test-provider-key'))
})
afterEach(() => { db.sqlite.close(); vi.unstubAllGlobals() })
const run = (slug = 'one') => app.request(`/api/challenges/${slug}/ai/draft`, {
  method: 'POST', headers: { cookie: 'to_session=p1', 'content-type': 'application/json' },
}, { DB: db.DB, AI_KEY_SECRET: 'test-only' })

it('reserves quota before invoking a provider, including concurrent requests', async () => {
  const provider = vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    return Response.json({ choices: [{ message: { content: 'A useful draft' } }] })
  })
  vi.stubGlobal('fetch', provider)
  const responses = await Promise.all(Array.from({ length: 20 }, () => run()))
  expect(responses.filter(r => r.status === 200)).toHaveLength(8)
  expect(responses.filter(r => r.status === 429)).toHaveLength(12)
  expect(provider).toHaveBeenCalledTimes(8)
})

it('counts failed calls so provider errors cannot bypass the spend guard', async () => {
  const provider = vi.fn(async () => new Response('unavailable', { status: 503 }))
  vi.stubGlobal('fetch', provider)
  for (let i = 0; i < 8; i++) expect((await run()).status).toBe(502)
  expect((await run()).status).toBe(429)
  expect(provider).toHaveBeenCalledTimes(8)
  const publicRuns = await app.request('/api/challenges/one/ai/runs', {}, { DB: db.DB })
  expect((await publicRuns.json()).runs).toEqual([])
})
