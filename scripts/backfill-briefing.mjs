// One-shot backfill: split the pipe-joined Scout source_note into the columns
// added alongside it. Run once per database after db:migrate.
//
//   node scripts/backfill-briefing.mjs <local|dev|prod> [--apply]
//
// Dry run by default. Prints every row it would change and writes nothing until
// --apply is passed.
//
// It parses the exact string scout-cloudflare.ts used to build:
//   "Automated source checks; reported <date>. <confirms> | <status>: <note> |
//    Reach: <reason> Severity: <severity>. <picture note>"
// Anything that does not match that shape is left untouched and reported, never
// guessed at. Rows written by the new code already have their columns and are
// skipped by the WHERE clause.
//
// `problem` is deliberately NOT invented here. The old blob has no problem
// statement in it - that field did not exist when these rows were written, which
// is the whole reason the page could not show one. Backfill recovers what is
// actually there (evidence, status, severity, and a reason when the note gives a
// real one) and leaves `problem` NULL for a re-scout to fill. Writing a
// generated sentence into it would put words in the article's mouth.
import { execFileSync } from 'node:child_process'

const target = process.argv[2]
const apply = process.argv.includes('--apply')
if (!['local', 'dev', 'prod'].includes(target)) throw new Error('Expected local, dev or prod')
const db = target === 'dev' ? 'techno-optimists-dev' : 'techno-optimists'
const base = ['wrangler', 'd1', 'execute', db, target === 'local' ? '--local' : '--remote']
const run = (extra) => execFileSync('npx', [...base, ...extra], { encoding: 'utf8' })
const query = (sql) => {
  const out = run(['--command', sql, '--json'])
  return JSON.parse(out.slice(out.indexOf('[')))[0].results
}

// Same stub rejection as the importer: a reason that says nothing is worse on
// the page than no reason at all, because it occupies the slot that answers the
// reader's question.
const STUB = /^(ongoing|no |none|n\/a|unknown|unclear|tbd|assessing|under (review|investigation)|investigation)/i
const meaningful = (value) => {
  const text = value?.trim()
  return !text || text.length < 12 || STUB.test(text) ? null : text
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', eacute: 'é',
}
const decode = (text) => (text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
  if (body[0] === '#') {
    const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : whole
  }
  return ENTITIES[body.toLowerCase()] ?? whole
}).trim()

export function parseScoutNote(note) {
  const head = /^Automated source checks; reported ([\d-]+)\.\s*([\s\S]*)$/.exec(note ?? '')
  if (!head) return null
  const parts = head[2].split(' | ')
  if (parts.length < 3) return null
  const status = /^(unsolved|partially_solved|solved_elsewhere):\s*([\s\S]*)$/.exec(parts[1].trim())
  const reach = /^Reach:\s*([\s\S]*?)\s*Severity:\s*(low|moderate|high|critical)\.?\s*([\s\S]*)$/.exec(parts[2].trim())
  if (!status || !reach) return null
  return {
    evidence: decode(parts[0]),
    solve_status: status[1],
    why_unsolved: meaningful(decode(status[2])),
    severity: reach[2],
    // What is left is provenance: how it was checked, where the cover came from.
    source_note: `Automated source checks; reported ${head[1]}. ${decode(reach[3])}`.trim(),
  }
}

const quote = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)

const rows = query(
  "SELECT slug, source_note FROM challenges WHERE source_note LIKE '%|%' AND evidence IS NULL",
)
console.log(`${rows.length} row(s) with an unsplit note on ${target}\n`)

let parsed = 0
const failures = []
for (const row of rows) {
  const fields = parseScoutNote(row.source_note)
  if (!fields) { failures.push(row.slug); continue }
  parsed++
  console.log(`${row.slug}
  status   ${fields.solve_status} / ${fields.severity}
  why      ${fields.why_unsolved ?? '(none - left NULL, stub rejected)'}
  evidence ${fields.evidence.slice(0, 90)}${fields.evidence.length > 90 ? '…' : ''}`)
  if (apply) {
    run(['--command', `UPDATE challenges SET
      evidence=${quote(fields.evidence)},
      solve_status=${quote(fields.solve_status)},
      severity=${quote(fields.severity)},
      why_unsolved=${quote(fields.why_unsolved)},
      source_note=${quote(fields.source_note)}
      WHERE slug=${quote(row.slug)}`])
  }
  console.log('')
}

if (failures.length) console.log(`Left untouched (shape did not match): ${failures.join(', ')}`)
console.log(`\nparsed ${parsed}/${rows.length}${apply ? ' - written' : ' - DRY RUN, pass --apply to write'}`)
console.log('`problem` stays NULL by design; a re-scout fills it. See the header comment.')
