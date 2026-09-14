// Called only by the root, coordinated db:migrate scripts. Existing data stays.
import { execFileSync } from 'node:child_process'
const target = process.argv[2]
if (!['local', 'dev', 'prod'].includes(target)) throw new Error('Expected local, dev or prod')
const db = target === 'dev' ? 'techno-optimists-dev' : 'techno-optimists'
const args = ['wrangler', 'd1', 'execute', db, target === 'local' ? '--local' : '--remote']
const run = (extra) => execFileSync('npx', [...args, ...extra], { encoding: 'utf8' })
const tables = JSON.parse(run(['--command', 'PRAGMA table_info(challenges)', '--json']))
if (!tables[0]?.results?.length) throw new Error('No challenges table; refusing to initialize an unknown database')
if (!tables[0].results.some((c) => c.name === 'emoji')) {
  run(['--command', 'ALTER TABLE challenges ADD COLUMN emoji TEXT'])
}
// Ring count 1..5 indexing IMPACT_TIERS. Nullable on purpose: every row that
// existed before this column keeps an unspecified impact rather than being
// backfilled to a tier nobody chose.
if (!tables[0].results.some((c) => c.name === 'impact')) {
  run(['--command', 'ALTER TABLE challenges ADD COLUMN impact INTEGER'])
}
// Externally funded reward, all six columns or none. Nullable on purpose: a
// prize enriches a thread that already exists, so every current row keeps a
// NULL prize rather than being backfilled. prize_amount is minor units as an
// INTEGER - a REAL would round a $10,000,000 purse to $9,999,999.99.
// See docs/2026-09-14-prize-threads.md.
const prizeColumns = [
  ['prize_amount', 'INTEGER'],
  ['prize_currency', 'TEXT'],
  ['prize_sponsor', 'TEXT'],
  ['prize_url', 'TEXT'],
  ['prize_deadline', 'TEXT'],
  ['prize_note', 'TEXT'],
]
for (const [name, sqlType] of prizeColumns) {
  if (!tables[0].results.some((c) => c.name === name)) {
    run(['--command', `ALTER TABLE challenges ADD COLUMN ${name} ${sqlType}`])
  }
}
// Partial index, so a row with no prize costs nothing. IF NOT EXISTS makes the
// whole block repeatable, which is what lets ship run it on every deploy.
run(['--command', 'CREATE INDEX IF NOT EXISTS idx_challenges_prize ON challenges(prize_deadline) WHERE prize_amount IS NOT NULL'])
run(['--file', 'packages/db/community.sql'])
console.log(`Community schema ready (${target}); existing records preserved.`)
