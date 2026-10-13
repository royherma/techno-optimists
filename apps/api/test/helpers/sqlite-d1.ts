import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export const sqliteD1 = (...schemaFiles: string[]) => {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of schemaFiles) {
    sqlite.exec(readFileSync(new URL(`../../../../packages/db/${name}`, import.meta.url), 'utf8'))
  }
  const prepare = (sql: string) => {
    let params: any[] = []
    const statement = {
      bind(...args: any[]) { params = args; return statement },
      async first() { return sqlite.prepare(sql).get(...params) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...params) } },
      execute() {
        const r = sqlite.prepare(sql).run(...params)
        return { ...r, meta: { changes: Number(r.changes) } }
      },
      async run() { return this.execute() },
    }
    return statement
  }
  const DB = {
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
  return { sqlite, DB }
}