import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { hashToken } from '../src/auth'

export const securityDb = async () => {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of ['schema.sql', 'community.sql']) {
    sqlite.exec(readFileSync(new URL(`../../../packages/db/${file}`, import.meta.url), 'utf8'))
  }
  sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('p1','reader','Private Reader'),('p2','owner','Private Owner'); INSERT INTO identities(person_id,email) VALUES ('p1','reader@example.test'),('p2','owner@example.test'); INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c1','one','problem','A real problem','Some useful context','p2')")
  for (const id of ['p1', 'p2']) {
    sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?,?,?)')
      .run(await hashToken(id), id, '2099-01-01')
  }
  const prepare = (sql: string) => {
    let args: (string | number | null)[] = []
    const execute = () => {
      const result = sqlite.prepare(sql).run(...args)
      return { success: true, meta: { changes: Number(result.changes) } }
    }
    const statement = {
      bind(...values: typeof args) { args = values; return statement },
      async first() { return sqlite.prepare(sql).get(...args) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...args) } },
      async run() { return execute() },
      execute,
    }
    return statement
  }
  const DB = { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = statements.map(s => s.execute())
      sqlite.exec('COMMIT')
      return results
    } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  } } as unknown as D1Database
  return { sqlite, DB }
}
