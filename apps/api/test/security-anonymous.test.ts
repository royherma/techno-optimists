import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks() })

it.each(['/api/site/view', '/api/challenges/one/view'])('bounds anonymous writes despite rotating user agents: %s', async (path) => {
  const responses = []
  for (let i = 0; i < 61; i++) responses.push(await app.request(path, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', 'user-agent': `bot-${i}` },
  }, { DB: db.DB }))
  expect(responses.filter(r => r.status === 200)).toHaveLength(60)
  expect(responses[60].status).toBe(429)
  expect(responses[60].headers.get('retry-after')).toBe('60')
})

it('bounds anonymous log injection per IP before emitting errors', async () => {
  for (let i = 0; i < 6; i++) {
    const response = await app.request('/api/client-errors', {
      method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.1', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'fake error', url: 'https://site.test/' }),
    }, { DB: db.DB })
    expect(response.status).toBe(i < 5 ? 200 : 429)
  }
  expect(console.error).toHaveBeenCalledTimes(5)
})
