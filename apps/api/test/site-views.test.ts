import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'

// The real route SQL against real SQLite, including the (visitor, day) dedupe.
let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../../../packages/db/community.sql', import.meta.url), 'utf8'))
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
  DB = { prepare } as unknown as D1Database
})
afterEach(() => sqlite.close())

const load = (ip: string, ua = 'a', headers: Record<string, string> = {}) =>
  app.request('/api/site/view', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip, 'user-agent': ua, ...headers },
  }, { DB })

describe('site hit counter', () => {
  it('counts a visitor once however many times they reload, and a second visitor separately', async () => {
    expect((await (await load('1.1.1.1')).json()).views).toBe(1)
    expect((await (await load('1.1.1.1')).json()).views).toBe(1)
    expect((await (await load('2.2.2.2')).json()).views).toBe(2)
    // A different browser on the same address is a different reader.
    expect((await (await load('2.2.2.2', 'other')).json()).views).toBe(3)
  })

  it('counts a load of any page, not only a Challenge', async () => {
    // The reason this table is not a SUM over challenge_views: nothing about
    // the counter depends on a Challenge existing.
    expect(sqlite.prepare('SELECT COUNT(*) n FROM challenges').get()!.n).toBe(0)
    expect((await (await load('3.3.3.3')).json()).views).toBe(1)
  })

  it('reads the total without recording a visit', async () => {
    await load('1.1.1.1')
    const r = await app.request('/api/site/views', {}, { DB })
    expect((await r.json()).views).toBe(1)
    // Still 1: the GET is a read.
    expect((await (await app.request('/api/site/views', {}, { DB })).json()).views).toBe(1)
  })

  it('starts at zero rather than erroring on an empty table', async () => {
    expect((await (await app.request('/api/site/views', {}, { DB })).json()).views).toBe(0)
  })

  it('refuses a cross-site POST', async () => {
    const r = await load('1.1.1.1', 'a', { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
    expect(sqlite.prepare('SELECT COUNT(*) n FROM site_views').get()!.n).toBe(0)
  })

  it('accepts a ping with no body and no content-type', async () => {
    // The community router would 415 this. The counter must not require a body.
    expect((await load('4.4.4.4')).status).toBe(200)
  })

  it('never stores the raw address', async () => {
    await load('9.9.9.9')
    const row = sqlite.prepare('SELECT viewer_key FROM site_views').get() as { viewer_key: string }
    expect(row.viewer_key).not.toContain('9.9.9.9')
    expect(row.viewer_key).toMatch(/^[0-9a-f]{24}$/)
  })

  it('hashes the same reader differently here than on a Challenge', async () => {
    // The site salt is what stops the two tables being joined to follow
    // someone from the counter onto a particular Challenge.
    sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('one','one','One')")
    sqlite.exec("INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c','pond','problem','Pond','A pond','one')")
    await load('5.5.5.5')
    await app.request('/api/challenges/pond/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '5.5.5.5', 'user-agent': 'a' },
    }, { DB })
    const site = (sqlite.prepare('SELECT viewer_key FROM site_views').get() as { viewer_key: string }).viewer_key
    const challenge = (sqlite.prepare('SELECT viewer_key FROM challenge_views').get() as { viewer_key: string }).viewer_key
    expect(site).not.toBe(challenge)
  })
})
