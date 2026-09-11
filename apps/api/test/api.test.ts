import { describe, expect, it } from 'vitest'
import { app, json, mergeActions, overRateLimit, secured } from '../src/index'
import { track } from '../src/analytics'
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
 * and nothing in the log - see docs/CONSTRAINTS.md for the sign-in outage that
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

/**
 * The rule the whole identity split exists to enforce: an address reaches the
 * person it belongs to and nobody else. These assert the boundary from the
 * outside, on the actual response body, because that is the only place the
 * guarantee is real - a type can be satisfied by a route that spreads a row.
 */
describe('an email never reaches anyone but its owner', () => {
  const personRow = {
    id: 'p_1', handle: 'mei', name: 'Mei Chen', avatar_url: null, location: 'Taipei',
    skills: '["welding"]', roles: '["builder"]', created_at: '2026-01-01 00:00:00',
    email: 'mei@example.com', is_admin: 0, challenges_count: 3,
  }
  const withPerson = () => ({ DB: stubDb([], personRow) as unknown as D1Database })

  it('does not put an address on a public profile', async () => {
    const r = await app.request('/api/people/mei', {}, withPerson())
    const text = await r.text()
    expect(r.status).toBe(200)
    expect(text).not.toContain('mei@example.com')
    expect(text).not.toContain('@example.com')
  })

  it('does not put a real name on a public profile either', async () => {
    // Same argument as the address: `name` is derived from the email local
    // part at signup, so it is real-identity data nobody chose to publish.
    const text = await (await app.request('/api/people/mei', {}, withPerson())).text()
    expect(text).not.toContain('Mei Chen')
  })

  it('does not leak the admin flag to a stranger', async () => {
    const text = await (await app.request('/api/people/mei', {}, withPerson())).text()
    expect(text).not.toContain('is_admin')
  })

  it('returns the public fields it is supposed to', async () => {
    const body = await (await app.request('/api/people/mei', {}, withPerson())).json() as {
      person: { handle: string; skills: string[]; challenges_count: number }
    }
    expect(body.person.handle).toBe('mei')
    expect(body.person.skills).toEqual(['welding'])
    expect(body.person.challenges_count).toBe(3)
  })

  it('404s an unknown handle rather than answering with an empty person', async () => {
    const r = await app.request('/api/people/nobody', {}, env())
    expect(r.status).toBe(404)
  })

  it('gives an anonymous caller no person at all from /api/auth/me', async () => {
    const body = await (await app.request('/api/auth/me', {}, env())).json() as { person: null }
    expect(body.person).toBeNull()
  })
})

describe('changing your own profile', () => {
  it('requires a session - there is no id in the path to aim at someone else', async () => {
    const r = await app.request('/api/people/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'newname' }),
    }, env())
    expect(r.status).toBe(401)
  })

  it('rejects a body that is not an object', async () => {
    const r = await app.request('/api/people/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    }, env())
    // No session, so 401 comes first - the point is it does not 500.
    expect([400, 401]).toContain(r.status)
  })
})

/**
 * The limiter is a query, so it is testable without a database: these assert
 * the thresholds and the null-IP branch, which is where an off-by-one or a
 * `ip = NULL` comparison would quietly disable half of it.
 */
describe('sign-in is rate limited', () => {
  const counts = (by_email: number, by_ip: number) => ({
    prepare: () => ({
      bind: function () { return this },
      first: async () => ({ by_email, by_ip }),
    }),
  }) as unknown as D1Database

  it('allows a request below both limits', async () => {
    expect(await overRateLimit(counts(4, 19), 'a@b.com', '1.2.3.4')).toBe(false)
  })

  it('refuses the sixth request from one address within the hour', async () => {
    expect(await overRateLimit(counts(5, 0), 'a@b.com', '1.2.3.4')).toBe(true)
  })

  it('refuses the twenty-first request from one IP', async () => {
    expect(await overRateLimit(counts(0, 20), 'a@b.com', '1.2.3.4')).toBe(true)
  })

  it('still applies the per-address limit when there is no IP header', async () => {
    // A local curl has no CF-Connecting-IP. Sign-in must still work, and the
    // address limit must still bite.
    expect(await overRateLimit(counts(0, 0), 'a@b.com', null)).toBe(false)
    expect(await overRateLimit(counts(5, 0), 'a@b.com', null)).toBe(true)
  })

  it('does not refuse on an IP count when the caller has no IP', async () => {
    // `ip = NULL` is never true in SQL so by_ip is 0 in practice, but if it
    // ever were not, a null caller must not inherit someone else's count.
    expect(await overRateLimit(counts(0, 99), 'a@b.com', null)).toBe(false)
  })

  it('refuses a real request rather than sending mail', async () => {
    const overLimit = {
      prepare: () => ({
        bind: function () { return this },
        first: async () => ({ by_email: 5, by_ip: 0 }),
      }),
      batch: async () => { throw new Error('must not write a link when over the limit') },
    }
    const r = await app.request('/api/auth/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    }, { DB: overLimit as unknown as D1Database, ENVIRONMENT: 'dev' })
    expect(r.status).toBe(429)
    // The refusal must not confirm the address exists or which limit tripped.
    expect(await r.text()).not.toMatch(/email|address|hour/i)
  })
})

/**
 * Anyone signed in may add to the progress log. Moving the Challenge along its
 * lifecycle rewrites the object itself, and belongs to whoever owns it.
 */
describe('only the author moves a Challenge to a new stage', () => {
  const session = { cookie: 'to_session=' + 'b'.repeat(64) }
  // currentPerson() resolves first, then the challenge row. stubSeq answers in
  // that order.
  const db = (authorId: string) => stubSeq(
    { id: 'p_me', handle: 'me', name: 'Me', avatar_url: null, location: null, roles: '[]', email: 'me@b.com', is_admin: 0 },
    { id: 'c_1', author_id: authorId },
  ) as unknown as D1Database

  const post = (authorId: string, body: unknown) =>
    app.request('/api/challenges/a-slug/updates', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...session },
      body: JSON.stringify(body),
    }, { DB: db(authorId) })

  it('refuses a stage change on someone else\'s Challenge', async () => {
    const r = await post('p_someone_else', { body: 'done', stage: 'learn' })
    expect(r.status).toBe(403)
  })

  it('lets the author move their own', async () => {
    const r = await post('p_me', { body: 'done', stage: 'learn' })
    expect(r.status).toBe(201)
  })

  it('still lets a stranger post an update with no stage', async () => {
    const r = await post('p_someone_else', { body: 'I tried this too' })
    expect(r.status).toBe(201)
  })
})

/**
 * Set in one place so no route can be added later that misses them. The two
 * that need asserting are frame-ancestors (a <meta> CSP cannot carry it, so
 * without the header the page is frameable) and the API's own CSP (a JSON
 * response opened in a tab has no Astro meta tag at all).
 */
describe('every response carries the security headers', () => {
  const get = async (path: string, proto = 'https') => {
    const res = await app.fetch(new Request(`${proto}://example.com${path}`), env() as never)
    return secured(res, new Request(`${proto}://example.com${path}`))
  }

  it('denies framing', async () => {
    const r = await get('/api/health')
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })

  it('sets nosniff and a referrer policy', async () => {
    const r = await get('/api/health')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('sends HSTS over https', async () => {
    const r = await get('/api/health')
    expect(r.headers.get('strict-transport-security')).toMatch(/max-age=31536000/)
  })

  it('omits HSTS on plain http, so local dev is not pinned to https for a year', async () => {
    const r = await get('/api/health', 'http')
    expect(r.headers.get('strict-transport-security')).toBeNull()
  })

  it('denies everything on an API response, which renders nothing', async () => {
    const r = await get('/api/health')
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('does not restate script-src on a page, which would override Astro\'s hashes', async () => {
    // Two policies intersect per directive. A 'self' here would beat the
    // per-build hashes in the meta tag and break island hydration.
    const r = await get('/')
    expect(r.headers.get('content-security-policy')).not.toContain('script-src')
  })
})
