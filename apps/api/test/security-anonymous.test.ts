import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => {
  f = await securityFixture()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { f.sqlite.close(); vi.restoreAllMocks() })
const post = (path: string, ua: string, body?: unknown, ip = '192.0.2.1') => app.request(path, {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': ua },
  ...(body ? { body: JSON.stringify(body) } : {}),
}, { DB: f.DB })

it.each(['/api/site/view', '/api/challenges/pond/view'])('bounds anonymous writes despite rotating user agents on %s', async (path) => {
  for (let i = 0; i < 60; i++) expect((await post(path, `agent-${i}`)).status).toBe(200)
  expect((await post(path, 'new-agent')).status).toBe(429)
  const table = path === '/api/site/view' ? 'site_views' : 'challenge_views'
  expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n).toBe(60)
  expect((await post(path, 'another-person', undefined, '192.0.2.2')).status).toBe(200)
})

it('bounds anonymous error log writes independently of supplied user-agent and message', async () => {
  const body = { message: 'error', url: 'https://site.test/' }
  for (let i = 0; i < 10; i++) expect((await post('/api/client-errors', `agent-${i}`, body)).status).toBe(200)
  expect((await post('/api/client-errors', 'new-agent', body)).status).toBe(429)
  expect(console.error).toHaveBeenCalledTimes(10)
})
