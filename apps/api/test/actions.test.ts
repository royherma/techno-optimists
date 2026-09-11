import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'
import { hashToken } from '../src/auth'

// Execute the actual route SQL against SQLite, including its unique constraint.
let sqlite: DatabaseSync
let DB: D1Database
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('one','one','One'),('two','two','Two')")
  sqlite.exec("INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c','pond','problem','Pond','A pond','one')")
  for (const who of ['one', 'two']) sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?,?,?)').run(await hashToken(who), who, '2099-01-01')
  const prepare = (sql: string) => {
    let params: any[] = []
    const statement = {
      bind(...args: any[]) { params = args; return statement },
      async first() { return sqlite.prepare(sql).get(...params) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...params) } },
      async run() { return sqlite.prepare(sql).run(...params) },
    }
    return statement
  }
  DB = { prepare, batch: async (statements: any[]) => {
    sqlite.exec('BEGIN')
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results }
    catch (e) { sqlite.exec('ROLLBACK'); throw e }
  } } as unknown as D1Database
})
afterEach(() => sqlite.close())
const request = (path: string, who?: string, body?: unknown) => app.request(path, {
  method: body ? 'POST' : 'GET',
  headers: { ...(who ? { cookie: `to_session=${who}` } : {}), 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
}, { DB })
const act = (who: string, active: boolean, kind = 'follow') => request('/api/challenges/pond/action', who, { kind, active })

describe('saved reactions', () => {
  it('adds once, survives a reload, and removes once without removing another person', async () => {
    expect((await (await act('one', true)).json()).actions.follow).toBe(1)
    expect((await (await act('one', true)).json()).actions.follow).toBe(1)
    expect((await (await act('two', true)).json()).actions.follow).toBe(2)
    expect(await (await request('/api/challenges/pond/actions/me', 'one')).json()).toEqual({ mine: ['follow'] })
    expect((await (await act('one', false)).json()).actions.follow).toBe(1)
    expect((await (await act('one', false)).json()).actions.follow).toBe(1)
    expect(await (await request('/api/challenges/pond/actions/me', 'one')).json()).toEqual({ mine: [] })
    expect(await (await request('/api/challenges/pond/actions/me', 'two')).json()).toEqual({ mine: ['follow'] })
  })
  it('groups activity by Challenge, keeps all response types, and scopes it to the session', async () => {
    await act('one', true); await act('one', true, 'can_help')
    const r = await request('/api/people/me/activity', 'one')
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    const d = await r.json()
    expect(d.items).toHaveLength(1)
    expect(d.items[0].kinds.sort()).toEqual(['can_help', 'follow'])
    expect(d.items[0].slug).toBe('pond')
    expect((await (await request('/api/people/me/activity', 'two')).json()).items).toEqual([])
    await act('one', false); await act('one', false, 'can_help')
    expect((await (await request('/api/people/me/activity', 'one')).json()).items).toEqual([])
  })
  it('rejects anonymous writes and private activity, while anonymous selection reads are empty', async () => {
    expect((await request('/api/challenges/pond/action', undefined, { kind: 'follow', active: false })).status).toBe(401)
    expect((await request('/api/people/me/activity')).status).toBe(401)
    expect(await (await request('/api/challenges/pond/actions/me')).json()).toEqual({ mine: [] })
  })
  it('validates the desired state instead of treating strings as true', async () => {
    expect((await request('/api/challenges/pond/action', 'one', { kind: 'follow', active: 'false' })).status).toBe(400)
  })
})
