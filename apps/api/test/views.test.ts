import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'

// The real route SQL against real SQLite, including the dedupe primary key.
let sqlite: DatabaseSync
let DB: D1Database
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../../../packages/db/community.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('one','one','One')")
  sqlite.exec("INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c','pond','problem','Pond','A pond','one')")
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

const view = (ip: string, ua = 'a', slug = 'pond') => app.request(`/api/challenges/${slug}/view`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': ua },
}, { DB })

describe('challenge views', () => {
  it('counts a viewer once however many times they reload, and counts a second viewer separately', async () => {
    expect((await (await view('1.1.1.1')).json()).views_count).toBe(1)
    expect((await (await view('1.1.1.1')).json()).views_count).toBe(1)
    expect((await (await view('2.2.2.2')).json()).views_count).toBe(2)
    // A different browser on the same address is a different reader.
    expect((await (await view('2.2.2.2', 'other')).json()).views_count).toBe(3)
  })

  it('reports the count on the detail payload and starts at zero', async () => {
    const before = await (await app.request('/api/challenges/pond', {}, { DB })).json()
    expect(before.challenge.views_count).toBe(0)
    await view('1.1.1.1')
    const after = await (await app.request('/api/challenges/pond', {}, { DB })).json()
    expect(after.challenge.views_count).toBe(1)
  })

  it('reports the count on the feed as well', async () => {
    await view('1.1.1.1')
    const feed = await (await app.request('/api/challenges', {}, { DB })).json()
    expect(feed.challenges[0].views_count).toBe(1)
  })

  it('404s an unknown Challenge rather than recording a view for nothing', async () => {
    expect((await view('1.1.1.1', 'a', 'no-such-slug')).status).toBe(404)
    expect(sqlite.prepare('SELECT COUNT(*) n FROM challenge_views').get()!.n).toBe(0)
  })

  it('never stores the raw address', async () => {
    await view('9.9.9.9')
    const row = sqlite.prepare('SELECT viewer_key FROM challenge_views').get() as { viewer_key: string }
    expect(row.viewer_key).not.toContain('9.9.9.9')
    expect(row.viewer_key).toMatch(/^[0-9a-f]{24}$/)
  })
})
