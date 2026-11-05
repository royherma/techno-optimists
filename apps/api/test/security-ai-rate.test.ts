import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { saveAccount } from '../src/ai-accounts'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
const secret = { AI_KEY_SECRET: 'test-only-secret' }
beforeEach(async () => {
  f = await securityFixture()
  await saveAccount({ DB: f.DB, ...secret }, 'p1', 'openrouter', 'test-paid-key', null)
  f.sqlite.exec("INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c2','lake','problem','Lake problem','A lake needs help','p1')")
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: 'A useful result' } }], model: 'test-model', usage: { cost: 0.1 } })))
})
afterEach(() => { f.sqlite.close(); vi.unstubAllGlobals() })
const run = (slug = 'pond') => app.request(`/api/challenges/${slug}/ai/structure`, {
  method: 'POST', headers: f.headers, body: '{}',
}, { DB: f.DB, ...secret })

const synchronizeBudgetReads = (total: number) => {
  const original = f.DB
  let arrived = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  f.DB = {
    ...original,
    prepare(sql: string) {
      const statement = original.prepare(sql)
      if (!sql.includes('COUNT(*) n FROM ai_runs WHERE challenge_id')) return statement
      return {
        bind(...args: unknown[]) { statement.bind(...args); return this },
        async first() {
          const row = await statement.first()
          if (++arrived === total) release()
          await gate
          return row
        },
      } as D1PreparedStatement
    },
  }
}

it('reserves a thread budget before concurrent paid provider calls', async () => {
  synchronizeBudgetReads(12)
  const responses = await Promise.all(Array.from({ length: 12 }, () => run()))
  expect(responses.filter(r => r.status === 200)).toHaveLength(8)
  expect(responses.filter(r => r.status === 429)).toHaveLength(4)
  expect(fetch).toHaveBeenCalledTimes(8)
})

it('bounds the account budget across threads', async () => {
  synchronizeBudgetReads(16)
  const responses = await Promise.all(Array.from({ length: 16 }, (_, i) => run(i % 2 ? 'pond' : 'lake')))
  expect(responses.filter(r => r.status === 200)).toHaveLength(12)
  expect(responses.filter(r => r.status === 429)).toHaveLength(4)
  expect(fetch).toHaveBeenCalledTimes(12)
})

it('does not refund failed attempts that may have incurred a provider charge', async () => {
  vi.mocked(fetch).mockImplementation(async () => new Response('unavailable', { status: 503 }))
  for (let i = 0; i < 8; i++) expect((await run()).status).toBe(502)
  expect((await run()).status).toBe(429)
  expect(fetch).toHaveBeenCalledTimes(8)
})
