import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { app } from '../src/index'
import { hashToken } from '../src/auth'
import { emojiValue } from '../src/community'

// Exercise the real schema, foreign keys and SQL through a minimal D1 adapter.
let sqlite: DatabaseSync
let DB: D1Database
const token = 'c'.repeat(64)
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
  sqlite.exec("INSERT INTO people (id,handle,name) VALUES ('p1','reader','Reader'),('p2','owner','Owner'); INSERT INTO identities(person_id,email) VALUES ('p1','reader@example.com'); INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c1','one','problem','A real challenge','Some context','p2'),('c2','two','problem','Another challenge','Other context','p2')")
  sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?, ?, ?)').run(await hashToken(token), 'p1', '2099-01-01')
  const prepare = (sql: string) => {
    let args: (string | number | null)[] = []
    const stmt = {
      bind(...values: (string | number | null)[]) { args = values; return stmt },
      async first() { return sqlite.prepare(sql).get(...args) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...args) } },
      async run() { return sqlite.prepare(sql).run(...args) },
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

const request = (path: string, method = 'GET', body?: unknown, signed = true, origin?: string) => app.request(`https://site.test/api/challenges/${path}`, {
  method, headers: { 'content-type': 'application/json', ...(signed ? { cookie: `to_session=${token}` } : {}), ...(origin ? { origin } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}, { DB, ADMIN_EMAILS: 'qa-admin@example.test' })
const comment = (extra = {}) => ({ body: 'What about a covered bin?', request_id: crypto.randomUUID(), ...extra })

describe('community permissions and persistence', () => {
  it('lets everyone read, but requires a session to write', async () => {
    expect((await request('one/comments', 'GET', undefined, false)).status).toBe(200)
    expect((await request('one/comments', 'POST', comment(), false)).status).toBe(401)
    expect((await request('one/editorial', 'PATCH', { emoji: '🐦' }, false)).status).toBe(401)
  })
  it('rejects non-admin editorial edits and forged admin fields', async () => {
    expect((await request('one/editorial', 'PATCH', { emoji: '🐦', is_admin: true })).status).toBe(403)
    expect(sqlite.prepare('SELECT emoji FROM challenges WHERE id=?').get('c1')?.emoji).toBeNull()
  })
  it('saves and clears emoji for an authenticated admin only', async () => {
    sqlite.exec("UPDATE identities SET email='qa-admin@example.test', is_admin=1 WHERE person_id='p1'")
    expect((await request('one/editorial', 'PATCH', { emoji: '🐦', title: 'An improved title' })).status).toBe(200)
    expect((await (await request('one')).json()).challenge.emoji).toBe('🐦')
    expect((await request('one/editorial', 'PATCH', { emoji: '🐦🌱' })).status).toBe(400)
    expect((await request('one/editorial', 'PATCH', { stage: 'improve' })).status).toBe(400)
    expect((await request('one/editorial', 'PATCH', { emoji: '' })).status).toBe(200)
    expect(sqlite.prepare('SELECT emoji FROM challenges WHERE id=?').get('c1')?.emoji).toBeNull()
  })
  it('persists an idea and a reply without adding progress or changing stage', async () => {
    const first = await request('one/comments', 'POST', comment({ kind: 'idea' }))
    expect(first.status).toBe(201)
    const { id } = await first.json()
    expect((await request('one/comments', 'POST', comment({ parent_id: id }))).status).toBe(201)
    const data = await (await request('one/comments')).json()
    expect(data.comments).toHaveLength(2)
    expect(data.comments[1].parent_id).toBe(id)
    expect(data.comments[0].author.handle).toBe('reader')
    expect(JSON.stringify(data)).not.toContain('reader@example.com')
    const detail = await (await request('one')).json()
    expect(detail.updates).toEqual([])
    expect(detail.challenge.stage).toBe('spot')
    expect(detail.challenge.actions.have_idea).toBe(1)
  })
  it('rejects replies to another Challenge and empty responses', async () => {
    const { id } = await (await request('two/comments', 'POST', comment())).json()
    expect((await request('one/comments', 'POST', comment({ parent_id: id }))).status).toBe(400)
    expect((await request('one/comments', 'POST', comment({ body: '   ' }))).status).toBe(400)
    expect((await request('one/comments', 'POST', comment({ body: 'x'.repeat(5001) }))).status).toBe(400)
  })
  it('keeps retrying the same response idempotent', async () => {
    const body = comment()
    expect((await request('one/comments', 'POST', body)).status).toBe(201)
    expect((await request('one/comments', 'POST', body)).status).toBe(200)
    expect((await (await request('one/comments')).json()).comments).toHaveLength(1)
  })
  it('rejects cross-origin writes and limits bursts', async () => {
    expect((await request('one/comments', 'POST', comment(), true, 'https://stranger.test')).status).toBe(403)
    for (let i = 0; i < 5; i++) expect((await request('one/comments', 'POST', comment())).status).toBe(201)
    expect((await request('one/comments', 'POST', comment())).status).toBe(429)
  })
  it('loads older pages without losing same-second responses', async () => {
    const insert = sqlite.prepare("INSERT INTO challenge_comments(id,challenge_id,author_id,body,request_id) VALUES (?, 'c1', 'p1', ?, ?)")
    for (let i = 0; i < 55; i++) insert.run(`m${i}`, `Response ${i}`, crypto.randomUUID())
    const first = await (await request('one/comments')).json()
    expect(first.comments).toHaveLength(50)
    const older = await (await request(`one/comments?before=${first.next_cursor}`)).json()
    expect(older.comments).toHaveLength(5)
    expect(older.next_cursor).toBeNull()
    expect(new Set([...older.comments, ...first.comments].map((c) => c.id)).size).toBe(55)
    expect((await request('one/comments?before=oops')).status).toBe(400)
  })
  it('applies the additive tables twice without losing existing Challenges', () => {
    const migration = readFileSync(new URL('../../../packages/db/community.sql', import.meta.url), 'utf8')
    sqlite.exec(migration); sqlite.exec(migration)
    expect(sqlite.prepare('SELECT COUNT(*) n FROM challenges').get()?.n).toBe(2)
  })
})

describe('single emoji', () => {
  it.each(['🐟', '👩🏽‍🔬', '🇯🇵', '1️⃣', '', null])('accepts %s', (value) => expect(emojiValue.safeParse(value).success).toBe(true))
  it.each(['hello', '🐟🌱', '<script>', '12'])('rejects %s', (value) => expect(emojiValue.safeParse(value).success).toBe(false))
})

describe('public contribution profiles', () => {
  it('returns only authored public work and excludes private account and action data', async () => {
    await request('one/comments', 'POST', comment())
    sqlite.exec("UPDATE people SET name='Private Name', location='Private Location' WHERE id='p1'; INSERT INTO challenge_actions(person_id,challenge_id,kind) VALUES ('p1','c2','follow'); INSERT INTO updates(id,challenge_id,author_id,body) VALUES ('up1','c1','p1','A public result')")
    const response = await app.request('https://site.test/api/people/reader/contributions', {}, { DB })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.person).toEqual({ handle: 'reader' })
    expect(result.contributions.map((x: {kind: string}) => x.kind).sort()).toEqual(['comment', 'update'])
    expect(result.contributions.every((x: {slug: string}) => x.slug === 'one')).toBe(true)
    for (const secret of ['Private Name','Private Location','reader@example.com','token_hash','is_admin','follow']) expect(JSON.stringify(result)).not.toContain(secret)
  })
  it('distinguishes missing profiles and pages public Challenges deterministically', async () => {
    expect((await app.request('https://site.test/api/people/absent/contributions', {}, { DB })).status).toBe(404)
    const result = await (await app.request('https://site.test/api/people/owner/contributions?offset=1', {}, { DB })).json()
    expect(result.contributions).toHaveLength(1)
    expect(result.next_offset).toBeNull()
    expect(result.contributions[0].kind).toBe('challenge')
  })
})

it('paginates contributions without exposing private fields or dropping rows', async () => {
  const insert = sqlite.prepare("INSERT INTO updates(id,challenge_id,author_id,body) VALUES (?,'c1','p1','Public test result')")
  for (let i = 0; i < 35; i++) insert.run(`up-${String(i).padStart(2, '0')}`)
  const read = async (offset: number) => (await app.request(`https://site.test/api/people/reader/contributions?offset=${offset}`, {}, { DB })).json()
  const first = await read(0), second = await read(first.next_offset)
  expect(first.contributions).toHaveLength(30)
  expect(second.contributions).toHaveLength(5)
  expect(second.next_offset).toBeNull()
  expect(new Set([...first.contributions, ...second.contributions].map((r: {id: string}) => r.id)).size).toBe(35)
})


it('persists media-only responses and enforces the attachment limit', async () => {
  const image = '![Water measurement](/media/u/p1/sample.png)'
  const video = '![Field test](/media/u/p1/sample.mp4)'
  const body = `${image}\n\n${video}\n\n[Research](https://example.org)`
  expect((await request('one/comments', 'POST', comment({ body }))).status).toBe(201)
  const data = await (await request('one/comments')).json()
  expect(data.comments[0].body).toBe(body)
  expect((await request('one/comments', 'POST', comment({ body: Array(5).fill(image).join('\n') }))).status).toBe(400)
  expect((await request('one/comments', 'POST', comment({ body: Array(4).fill(image).join('\n') }))).status).toBe(201)
})
