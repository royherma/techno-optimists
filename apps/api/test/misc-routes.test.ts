import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'
import { hashToken } from '../src/auth'

let sqlite: DatabaseSync
let DB: D1Database
const token = 'c'.repeat(64)
const secondToken = 'd'.repeat(64)
const ADMIN = 'admin@example.test'

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../../../packages/db/community.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO people (id,handle,name) VALUES ('p1','reader','Reader'),('p2','owner','Owner'); INSERT INTO identities(person_id,email) VALUES ('p1','reader@example.com'); INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c1','one','problem','A real challenge','Some context','p2')")
  sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?, ?, ?)').run(await hashToken(token), 'p1', '2099-01-01')
  const prepare = (sql: string) => {
    let args: (string | number | null)[] = []
    const stmt = {
      bind(...values: (string | number | null)[]) { args = values; return stmt },
      async first() { return sqlite.prepare(sql).get(...args) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...args) } },
      async run() {
        const res = sqlite.prepare(sql).run(...args)
        return { meta: { changes: Number(res.changes), last_insert_rowid: Number(res.lastInsertRowid) } }
      },
    }
    return stmt
  }
  DB = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results }
    catch (e) { sqlite.exec('ROLLBACK'); throw e }
  } } as unknown as D1Database
})
afterEach(() => sqlite.close())

const request = (path: string, init: { method?: string; body?: unknown; cookie?: string; env?: { ADMIN_EMAILS?: string; SCOUT_ENABLED?: string } } = {}) =>
  app.request(`https://site.test${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.cookie ? { cookie: `to_session=${init.cookie}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  }, { DB, ...init.env })

const connect = (key: string, label: string) =>
  sqlite.exec(`INSERT INTO ai_accounts(person_id,provider,key_encrypted,label) VALUES ('p1','openrouter','${key}','${label}')`)
const addRun = (id: string, person: string, model: string, output: string, createdAt: string, linkedComment: string | null = null) =>
  sqlite.exec(`INSERT INTO ai_runs(id,challenge_id,person_id,action,model,provider,cost_usd,output,published_comment_id,created_at) VALUES ('${id}','c1','${person}','draft','${model}','openrouter',0.42,'${output}',${linkedComment ? `'${linkedComment}'` : 'NULL'},'${createdAt}')`)

describe('connected AI account', () => {
  it('is null for signed out and for a signed-in person with no row', async () => {
    expect(await (await request('/api/ai/account')).json()).toEqual({ account: null })
    expect(await (await request('/api/ai/account', { cookie: token })).json()).toEqual({ account: null })
  })
  it('returns the public account without the encrypted key', async () => {
    connect('cipher-v1', 'My Key')
    const res = await request('/api/ai/account', { cookie: token })
    expect(res.status).toBe(200)
    const { account } = await res.json()
    expect(account.provider).toBe('openrouter')
    expect(account.label).toBe('My Key')
    expect(JSON.stringify(account)).not.toContain('key_encrypted')
    expect(JSON.stringify(account)).not.toContain('cipher-v1')
  })
})

describe('disconnecting an AI account', () => {
  it('requires a session and deletes the connected row', async () => {
    expect((await request('/api/ai/disconnect', { method: 'POST' })).status).toBe(401)
    connect('cipher-v1', 'My Key')
    const res = await request('/api/ai/disconnect', { method: 'POST', cookie: token })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sqlite.prepare('SELECT COUNT(*) n FROM ai_accounts WHERE person_id=?').get('p1')?.n).toBe(0)
    expect(await (await request('/api/ai/account', { cookie: token })).json()).toEqual({ account: null })
  })
})

describe('linking an AI run to a published comment', () => {
  it('gates, validates, links once, and blocks re-linking', async () => {
    expect((await request('/api/ai/runs/air1/published', { method: 'POST', body: { comment_id: 'cm1' } })).status).toBe(401)
    const missing = await request('/api/ai/runs/air1/published', { method: 'POST', cookie: token, body: {} })
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ error: 'comment_id_required' })

    sqlite.exec("INSERT INTO challenge_comments(id,challenge_id,author_id,body,request_id) VALUES ('cm1','c1','p1','A response','req-1')")
    addRun('air1', 'p1', 'some-model', 'The original draft', '2026-01-02 00:00:00')
    const ok = await request('/api/ai/runs/air1/published', { method: 'POST', cookie: token, body: { comment_id: 'cm1' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })
    expect(sqlite.prepare('SELECT published_comment_id FROM ai_runs WHERE id=?').get('air1')?.published_comment_id).toBe('cm1')

    const again = await request('/api/ai/runs/air1/published', { method: 'POST', cookie: token, body: { comment_id: 'cm1' } })
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: false })
  })
})

describe('original draft behind a comment', () => {
  it('404s without a matching run and returns exactly the original fields', async () => {
    const missing = await request('/api/comments/cm1/original')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'not_found' })

    addRun('air1', 'p1', 'some-model', 'The original draft', '2026-01-02 00:00:00', 'cm1')
    const found = await request('/api/comments/cm1/original')
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual({ original: { model: 'some-model', output: 'The original draft', created_at: '2026-01-02 00:00:00' } })
  })
})

describe('runs donated to a challenge', () => {
  it('404s on an unknown slug and lists newest-first with public authors only', async () => {
    expect((await request('/api/challenges/absent/ai/runs')).status).toBe(404)
    addRun('r1', 'p1', 'm1', 'older output', '2026-01-01 00:00:00')
    addRun('r2', 'p2', 'm2', 'newer output', '2026-01-02 00:00:00')
    const res = await request('/api/challenges/one/ai/runs')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runs.map((r: { id: string }) => r.id)).toEqual(['r2', 'r1'])
    expect(body.runs[0].by).toEqual({ handle: 'owner', name: 'Owner', avatar_url: null })
    expect(body.runs[1].by).toEqual({ handle: 'reader', name: 'Reader', avatar_url: null })
    expect(JSON.stringify(body)).not.toContain('cost_usd')
  })
})

describe('signout', () => {
  it('is a no-op without a cookie and deletes the session with one', async () => {
    const noCookie = await request('/api/auth/signout', { method: 'POST', body: {} })
    expect(noCookie.status).toBe(200)
    expect(await noCookie.json()).toEqual({ ok: true })

    const res = await request('/api/auth/signout', { method: 'POST', cookie: token, body: {} })
    expect(res.status).toBe(200)
    const setCookies = res.headers.getSetCookie()
    expect(setCookies).toHaveLength(2)
    expect(setCookies.some((c) => c.includes('to_session=') && c.includes('Max-Age=0'))).toBe(true)
    expect(setCookies.some((c) => c.includes('to_signal=signed_out'))).toBe(true)
    expect(await (await request('/api/auth/me', { cookie: token })).json()).toEqual({ person: null })
  })
  it('with everywhere in the body drops every session for the same person', async () => {
    sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?, ?, ?)')
      .run(await hashToken(secondToken), 'p1', '2099-01-01')
    const res = await request('/api/auth/signout', { method: 'POST', cookie: token, body: { everywhere: true } })
    expect(res.status).toBe(200)
    expect(sqlite.prepare('SELECT COUNT(*) n FROM sessions WHERE person_id=?').get('p1')?.n).toBe(0)
    expect(await (await request('/api/auth/me', { cookie: secondToken })).json()).toEqual({ person: null })
  })
})

describe('scout read routes without a CACHE binding', () => {
  it('returns an empty source-run page', async () => {
    const res = await request('/api/scout/source-runs')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ runs: [], next_cursor: null })
  })
  it('reflects SCOUT_ENABLED and reports no last run', async () => {
    const off = await (await request('/api/scout/status')).json()
    expect(off.enabled).toBe(false)
    expect(off.last_run).toBeNull()
    const on = await (await request('/api/scout/status', { env: { SCOUT_ENABLED: 'true' } })).json()
    expect(on.enabled).toBe(true)
  })
})

describe('prize enrichment gate', () => {
  it('requires a session, admin, and the AI binding in that order', async () => {
    expect((await request('/api/prizes/enrich', { method: 'POST', env: { ADMIN_EMAILS: ADMIN } })).status).toBe(401)
    const notAdmin = await request('/api/prizes/enrich', { method: 'POST', cookie: token, env: { ADMIN_EMAILS: ADMIN } })
    expect(notAdmin.status).toBe(403)
    expect(await notAdmin.json()).toEqual({ error: 'admin_only' })
    sqlite.exec(`UPDATE identities SET email='${ADMIN}' WHERE person_id='p1'`)
    const noAi = await request('/api/prizes/enrich', { method: 'POST', cookie: token, env: { ADMIN_EMAILS: ADMIN } })
    expect(noAi.status).toBe(409)
    expect(await noAi.json()).toEqual({ error: 'no_ai_binding' })
  })
})

describe('manual scout run gate', () => {
  it('requires a session, admin, the flag, and a known source', async () => {
    expect((await request('/api/scout/run', { method: 'POST', env: { ADMIN_EMAILS: ADMIN } })).status).toBe(401)
    const notAdmin = await request('/api/scout/run', { method: 'POST', cookie: token, env: { ADMIN_EMAILS: ADMIN } })
    expect(notAdmin.status).toBe(403)
    expect(await notAdmin.json()).toEqual({ error: 'admin_only' })
    sqlite.exec(`UPDATE identities SET email='${ADMIN}' WHERE person_id='p1'`)
    const disabled = await request('/api/scout/run', { method: 'POST', cookie: token, env: { ADMIN_EMAILS: ADMIN } })
    expect(disabled.status).toBe(409)
    expect(await disabled.json()).toEqual({ error: 'scout_disabled' })
    const unknown = await request('/api/scout/run?source=not-a-real-feed', { method: 'POST', cookie: token, env: { ADMIN_EMAILS: ADMIN, SCOUT_ENABLED: 'true' } })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: 'unknown_source' })
  })
})

describe('upload gate', () => {
  it('requires a session and a MEDIA binding', async () => {
    const anon = await request('/api/uploads', { method: 'PUT' })
    expect(anon.status).toBe(401)
    expect(await anon.json()).toEqual({ error: 'sign_in_required' })
    const noMedia = await request('/api/uploads', { method: 'PUT', cookie: token })
    expect(noMedia.status).toBe(503)
    expect(await noMedia.json()).toEqual({ error: 'media_unavailable' })
  })
})
describe('feed paging', () => {
  it('walks every thread exactly once by following next_cursor', async () => {
    sqlite.exec("INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c2','two','problem','A second challenge','Some context','p2'),('c3','three','problem','A third challenge','Some context','p2')")
    const slugs: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 5; page++) {
      const data: { challenges: { slug: string }[]; next_cursor: string | null } = await (await request(`/api/challenges?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json()
      slugs.push(...data.challenges.map(c => c.slug))
      cursor = data.next_cursor
      if (!cursor) break
    }
    expect(cursor).toBeNull()
    expect(slugs.sort()).toEqual(['one', 'three', 'two'])
  })
})
