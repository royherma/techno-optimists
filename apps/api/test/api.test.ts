import { describe, expect, it } from 'vitest'
import { app, json, mergeActions, track } from '../src/index'
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

/**
 * The boundary is what turned a bare "Internal Server Error" into something
 * diagnosable. A D1 throw used to reach the client with no request id, no path
 * and nothing in the log - see docs/DECISIONS.md for the sign-in outage that
 * cost an afternoon.
 */
describe('an unhandled throw becomes a diagnosable 500', () => {
  // A DB whose every query throws the way D1 does on a schema mismatch.
  const throwingDb = () => ({
    prepare: () => ({
      bind: function () { return this },
      all: async () => { throw new Error('D1_ERROR: no such column: is_admin') },
      first: async () => { throw new Error('D1_ERROR: no such column: is_admin') },
    }),
    batch: async () => { throw new Error('D1_ERROR: no such column: is_admin') },
  })
  const boom = () => app.request('/api/health', {
    headers: { 'cf-ray': '8f2a1b3c4d5e6f70-SIN' },
  }, { DB: throwingDb() as unknown as D1Database })

  it('answers 500 rather than letting the throw escape', async () => {
    expect((await boom()).status).toBe(500)
  })

  it('returns the ray, so a log line can be found from the response alone', async () => {
    const body = await (await boom()).json() as { error: string; ray: string }
    expect(body.error).toBe('server_error')
    expect(body.ray).toBe('8f2a1b3c4d5e6f70-SIN')
  })

  it('never leaks the D1 message - it names columns and tables', async () => {
    const text = await (await boom()).text()
    expect(text).not.toContain('is_admin')
    expect(text).not.toContain('D1_ERROR')
  })

  it('still answers when there is no ray header at all', async () => {
    const r = await app.request('/api/health', {}, { DB: throwingDb() as unknown as D1Database })
    expect(r.status).toBe(500)
    expect((await r.json() as { ray: string }).ray).toBe('no-ray')
  })
})

/**
 * Telemetry must never be the reason a page fails. track() is called on paths
 * that work; if the dataset is missing or writeDataPoint throws, the request
 * has to carry on regardless.
 */
describe('track never breaks a request', () => {
  it('does nothing when no dataset is bound', () => {
    expect(() => track({ DB: stubDb() } as never, 'pageview', '/')).not.toThrow()
  })

  it('swallows a dataset that throws', () => {
    const env = {
      DB: stubDb(),
      ANALYTICS: { writeDataPoint: () => { throw new Error('AE down') } },
    }
    expect(() => track(env as never, 'pageview', '/')).not.toThrow()
  })

  it('writes path and kind positionally, and indexes by kind', () => {
    const seen: unknown[] = []
    const env = { DB: stubDb(), ANALYTICS: { writeDataPoint: (p: unknown) => seen.push(p) } }
    track(env as never, 'pageview', '/c/well-pump', { country: 'TH', status: 200 })
    expect(seen).toHaveLength(1)
    const p = seen[0] as { blobs: string[]; doubles: number[]; indexes: string[] }
    expect(p.blobs[0]).toBe('/c/well-pump')
    expect(p.blobs[1]).toBe('pageview')
    expect(p.blobs[2]).toBe('TH')
    expect(p.doubles[1]).toBe(200)
    expect(p.indexes).toEqual(['pageview'])
  })
})

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
/**
 * The callback calls first() twice - once for the row, once for the expiry
 * check - so the shared stub's single canned value cannot tell the branches
 * apart. This one answers each call in turn.
 */
const stubSeq = (...firsts: unknown[]) => {
  let i = 0
  return {
    prepare: () => ({
      bind: function () { return this },
      all: async () => ({ results: [] }),
      first: async () => firsts[i++] ?? null,
    }),
    batch: async () => [],
  }
}

describe('a failed sign-in says which thing went wrong', () => {
  const redeem = (db: unknown) =>
    app.request('/api/auth/callback?token=' + 'a'.repeat(64), {}, {
      DB: db as D1Database,
    })

  it('names an expired link when the row is past its expiry', async () => {
    const r = await redeem(stubSeq(
      { email: 'a@b.com', used_at: null, expires_at: '2020-01-01 00:00:00' },
      null,
    ))
    expect(r.headers.get('location')).toBe('/signin?error=expired')
  })

  it('names a used link rather than calling it expired', async () => {
    const r = await redeem(stubSeq(
      { email: 'a@b.com', used_at: '2026-01-01 00:00:00', expires_at: '2099-01-01 00:00:00' },
    ))
    expect(r.headers.get('location')).toBe('/signin?error=used')
  })

  it('does not claim a link expired when its row is gone', async () => {
    const r = await redeem(stubSeq(null))
    expect(r.headers.get('location')).toBe('/signin?error=unknown')
  })

  it('still rejects a request with no token at all', async () => {
    const r = await app.request('/api/auth/callback', {}, env())
    expect(r.headers.get('location')).toBe('/signin?error=missing')
  })
})

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
