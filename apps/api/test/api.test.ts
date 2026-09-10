import { describe, expect, it } from 'vitest'
import { app, json, mergeActions } from '../src/index'
import { ACTION_KINDS, EMPTY_ACTIONS } from '../../../packages/types/index'

describe('json', () => {
  it('parses a JSON string', () => {
    expect(json('["a","b"]', [])).toEqual(['a', 'b'])
  })
  it('falls back on malformed input rather than throwing', () => {
    expect(json('{not json', ['fallback'])).toEqual(['fallback'])
  })
  it('falls back when the column is null', () => {
    expect(json(null, {})).toEqual({})
  })
})

describe('mergeActions', () => {
  it('adds seed counts to real counts', () => {
    const out = mergeActions({ have_problem: 12 }, '{"have_problem":4700}')
    expect(out.have_problem).toBe(4712)
  })

  it('zero-fills every kind so the UI never sees undefined', () => {
    const out = mergeActions({}, null)
    expect(Object.keys(out).sort()).toEqual([...ACTION_KINDS].sort())
    for (const k of ACTION_KINDS) expect(out[k]).toBe(0)
  })

  it('survives a corrupt seed_actions column', () => {
    expect(mergeActions({ can_help: 3 }, 'garbage').can_help).toBe(3)
  })

  it('ignores seed keys that are not real action kinds', () => {
    const out = mergeActions({}, '{"not_a_kind":999}')
    expect(Object.values(out).every((n) => n === 0)).toBe(true)
  })

  it('does not mutate EMPTY_ACTIONS', () => {
    mergeActions({ follow: 5 }, null)
    expect(EMPTY_ACTIONS.follow).toBe(0)
  })
})

/**
 * Minimal D1 stub. Each prepare() returns canned rows so the route's own
 * validation, status codes and shaping are what get exercised.
 */
const stubDb = (rows: Record<string, unknown>[] = [], first: unknown = null) => ({
  prepare: () => ({
    bind: function () { return this },
    all: async () => ({ results: rows }),
    first: async () => first,
  }),
  batch: async () => [],
})

const env = () => ({ DB: stubDb() as unknown as D1Database })

describe('routes', () => {
  it('GET /api/health returns ok', async () => {
    const r = await app.request('/api/health', {}, env())
    expect(r.status).toBe(200)
  })

  it('rejects an unknown sort with 400', async () => {
    const r = await app.request('/api/challenges?sort=bogus', {}, env())
    expect(r.status).toBe(400)
  })

  it('rejects an unknown type with 400', async () => {
    const r = await app.request('/api/challenges?type=bogus', {}, env())
    expect(r.status).toBe(400)
  })

  it('404s an unknown slug', async () => {
    const r = await app.request('/api/challenges/nope', {}, env())
    expect(r.status).toBe(404)
  })

  it('401s an action with no actor header', async () => {
    const r = await app.request('/api/challenges/x/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'can_help' }),
    }, env())
    expect(r.status).toBe(401)
  })

  it('400s an action with a kind outside the vocabulary', async () => {
    const r = await app.request('/api/challenges/x/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-person-id': 'p_mei' },
      body: JSON.stringify({ kind: 'like' }),
    }, env())
    expect(r.status).toBe(400)
  })

  it('400s an action with no body at all', async () => {
    const r = await app.request('/api/challenges/x/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-person-id': 'p_mei' },
    }, env())
    expect(r.status).toBe(400)
  })
})

/**
 * The magic link is a bearer token for the account. If the response body ever
 * carries it where a stranger can POST an address, that stranger owns the
 * account. Dev keeps the convenience; prod must fail closed.
 */
describe('magic link is never returned to the caller in prod', () => {
  const requestLink = (environment?: string) =>
    app.request('/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stranger@example.com' }),
    }, { DB: stubDb() as unknown as D1Database, ENVIRONMENT: environment })

  it('withholds the link in prod, with no mail key configured', async () => {
    const r = await requestLink('prod')
    const body = await r.json() as { ok: boolean; sent: boolean; dev_link?: string }
    expect(r.status).toBe(200)
    expect(body.sent).toBe(false)
    expect(body.dev_link).toBeUndefined()
  })

  it('still returns the link in dev, so local sign-in works without mail', async () => {
    const body = await (await requestLink('dev')).json() as { dev_link?: string }
    expect(body.dev_link).toMatch(/\/api\/auth\/callback\?token=[0-9a-f]{64}/)
  })
})
