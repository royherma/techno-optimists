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
run(['--file', 'packages/db/community.sql'])
console.log(`Community schema ready (${target}); existing records preserved.`)
