import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'
import { hashToken } from '../src/auth'

/**
 * A magic link works exactly once. The stubs in api.test.ts cannot show that:
 * they answer canned rows, so a second redeem sees whatever the stub was told
 * to say rather than what the first redeem actually wrote. This runs the route's
 * own SQL against SQLite so the claim competes with a real row.
 */
let sqlite: DatabaseSync
let DB: D1Database

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))

  const prepare = (sql: string) => {
    let params: unknown[] = []
    const statement = {
      bind(...args: unknown[]) { params = args; return statement },
      async first() { return sqlite.prepare(sql).get(...params as []) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...params as []) } },
      // node:sqlite returns { changes }; D1 puts it under meta. The route reads
      // meta.changes, so without this shaping every claim would read undefined
      // and no one would ever be let in.
      async run() {
        const r = sqlite.prepare(sql).run(...params as [])
        return { meta: { changes: Number(r.changes) } }
      },
    }
    return statement
  }
  DB = {
    prepare,
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      sqlite.exec('BEGIN')
      try {
        const out = []
        for (const s of statements) out.push(await s.run())
        sqlite.exec('COMMIT')
        return out
      } catch (e) { sqlite.exec('ROLLBACK'); throw e }
    },
  } as unknown as D1Database
})
afterEach(() => sqlite.close())

const TOKEN = 'b'.repeat(64)
const mint = async (expires = '2099-01-01 00:00:00') => {
  sqlite.prepare('INSERT INTO magic_links (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .run(await hashToken(TOKEN), 'mei@example.com', expires)
}
const redeem = () => app.request(`/api/auth/callback?token=${TOKEN}`, {}, { DB })

describe('a magic link is redeemable exactly once', () => {
  it('signs the reader in on the first redeem', async () => {
    await mint()
    const r = await redeem()
    expect(r.status).toBe(302)
    expect(r.headers.get('set-cookie')).toContain('to_session=')
    expect(sqlite.prepare('SELECT COUNT(*) n FROM sessions').get()!.n).toBe(1)
  })

  it('rejects the second redeem and does not issue a second session', async () => {
    await mint()
    await redeem()
    const second = await redeem()
    expect(second.headers.get('location')).toBe('/signin?error=used')
    // The important half: one click, one session. A non-atomic claim showed up
    // here as 2.
    expect(sqlite.prepare('SELECT COUNT(*) n FROM sessions').get()!.n).toBe(1)
  })

  it('lets exactly one of two concurrent redeems through', async () => {
    await mint()
    const [a, b] = await Promise.all([redeem(), redeem()])
    const outcomes = [a, b].map((r) => r.headers.get('location'))
    expect(outcomes.filter((l) => l === '/signin?error=used')).toHaveLength(1)
    expect(sqlite.prepare('SELECT COUNT(*) n FROM sessions').get()!.n).toBe(1)
  })

  it('creates the person once, not once per redeem', async () => {
    await mint()
    await redeem()
    await redeem()
    expect(sqlite.prepare('SELECT COUNT(*) n FROM identities').get()!.n).toBe(1)
  })

  it('still refuses an expired link before claiming it', async () => {
    await mint('2020-01-01 00:00:00')
    const r = await redeem()
    expect(r.headers.get('location')).toBe('/signin?error=expired')
    // Refused, not consumed: the row stays unclaimed.
    expect(sqlite.prepare('SELECT used_at FROM magic_links').get()!.used_at).toBe(null)
  })
})
