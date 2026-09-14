import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { appendScoutRows, type ScoutRow } from '../src/scout-import'

// The unit tests cover `meaningful` in isolation. This one proves the thing the
// page actually depends on: that a row travelling through the real INSERT lands
// in the real columns, and that filler is dropped at write time rather than
// being left for the renderer to guess at.
function database() {
 const sql = new DatabaseSync(':memory:')
 sql.exec(readFileSync(new URL('../../../packages/db/schema.sql', import.meta.url), 'utf8'))
 sql.exec("INSERT INTO people (id,handle,name) VALUES ('atlas','atlas','Atlas')")
 const prepare = (query: string) => {
  let params: (string | number | null)[] = []
  return { bind(...p: (string | number | null)[]) { params = p; return this }, async first() { return sql.prepare(query).get(...params) ?? null }, execute() { return { meta: { changes: sql.prepare(query).run(...params).changes } } } }
 }
 const adapter = { prepare, async batch(statements: ReturnType<typeof prepare>[]) { sql.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results } catch (e) { sql.exec('ROLLBACK'); throw e } } }
 return { sql, db: adapter as unknown as D1Database }
}

const row: ScoutRow = {
 slug: 'scout-briefing-probe', type: 'problem', stage: 'spot',
 title: 'This valley lost 281 MW', summary: 'Fourteen plants are dark.',
 media: [], tags: ['energy'], source_url: 'https://example.org/valley/', created_at: '2026-09-13',
 problem: 'Monsoon floods knocked 281 MW of hydropower offline and fourteen plants are still dark.',
 why_unsolved: 'Access roads are washed out, so repair crews cannot reach the turbines.',
 evidence: '281 megawatts of capacity remains offline', solve_status: 'unsolved', severity: 'high',
}

describe('appendScoutRows writes the briefing columns', () => {
 it('stores a real problem, reason, quote, status and severity', async () => {
  const { sql, db } = database()
  try {
   await appendScoutRows(db, 'atlas', [row], false)
   expect(sql.prepare('SELECT problem,why_unsolved,evidence,solve_status,severity FROM challenges').get()).toMatchObject({
    problem: row.problem, why_unsolved: row.why_unsolved,
    evidence: row.evidence, solve_status: 'unsolved', severity: 'high',
   })
  } finally { sql.close() }
 })

 it('drops filler at write time so the page never renders an empty answer', async () => {
  const { sql, db } = database()
  try {
   // Both strings came back from the model on rows that are live in production.
   await appendScoutRows(db, 'atlas', [{ ...row, problem: 'Unknown', why_unsolved: 'Ongoing investigations' }], false)
   expect(sql.prepare('SELECT problem,why_unsolved,evidence FROM challenges').get()).toMatchObject({
    problem: null, why_unsolved: null, evidence: row.evidence,
   })
  } finally { sql.close() }
 })
})
