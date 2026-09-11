#!/usr/bin/env node
// Bulk-imports researched Challenges from a JSON file.
//
//   node scripts/import-challenges.mjs <file.json> [--base URL] [--author handle] [--write]
//
// Dry run by default: it prints what would be created or updated and writes
// nothing. Add --write to actually apply it. That default is deliberate - the
// destructive direction is the one you should have to ask for by name.
//
// Auth is the session cookie of an admin account, because the import route
// gates on the same is_admin the site does rather than inventing a second
// credential. Get one by signing in and copying the `to_session` cookie:
//
//   TO_SESSION=<cookie value> node scripts/import-challenges.mjs seeds/batch.json --write
//
// File format - an array of rows, or {author, challenges:[...]}:
//
//   [{ "type": "problem", "stage": "ideas",
//      "title": "...", "summary": "...", "body": "optional markdown",
//      "location": "Patna, India", "lat": 25.59, "lng": 85.13,
//      "tags": ["water","heat"],
//      "source_url": "https://...", "source_name": "Patna Press",
//      "source_note": "what we relied on, what stayed unconfirmed",
//      "created_at": "2026-05-20", "last_activity_at": "2026-09-01",
//      "seed_actions": { "have_problem": 120 } }]
//
// Every row needs source_url or source_name. The route refuses a batch without
// them: a Challenge logged on someone else's behalf with no stated source is
// the exact thing the provenance columns exist to prevent.

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}

const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true)
const base = flag('base', 'http://localhost:8787').replace(/\/$/, '')
const write = argv.includes('--write')

if (!file) {
  console.error('usage: import-challenges.mjs <file.json> [--base URL] [--author handle] [--write]')
  process.exit(2)
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
const challenges = Array.isArray(raw) ? raw : raw.challenges
const author = flag('author', (Array.isArray(raw) ? null : raw.author) ?? 'atlas')

if (!Array.isArray(challenges) || challenges.length === 0) {
  console.error(`${file}: expected an array of challenges, or {author, challenges:[...]}`)
  process.exit(2)
}

// Caught here rather than at the route so the message names the row by title.
// A 400 listing zod issue paths is accurate and unreadable when you are staring
// at a file of forty rows trying to find which one you forgot.
const missing = challenges.filter((c) => !c.source_url && !c.source_name)
if (missing.length) {
  console.error(`${missing.length} row(s) have no source_url or source_name:`)
  for (const c of missing) console.error(`  - ${c.title ?? '(untitled)'}`)
  process.exit(1)
}

const cookie = process.env.TO_SESSION
if (!cookie) {
  console.error('TO_SESSION is not set. Sign in as an admin and copy the to_session cookie:')
  console.error('  TO_SESSION=<value> node scripts/import-challenges.mjs ...')
  process.exit(2)
}

const res = await fetch(`${base}/api/challenges/import`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `to_session=${cookie}` },
  body: JSON.stringify({ author, dry_run: !write, challenges }),
})

const body = await res.json().catch(() => null)

if (!res.ok) {
  console.error(`${res.status} ${body?.error ?? 'request failed'}`)
  // bad_rows names the offending index and reason; anything else prints whole.
  for (const p of body?.problems ?? []) {
    console.error(`  row ${p.index}: ${p.error}${p.detail ? ` - ${p.detail}` : ''}`)
  }
  if (!body?.problems) console.error(JSON.stringify(body, null, 2))
  process.exit(1)
}

const created = body.plan.filter((p) => p.action === 'create')
const updated = body.plan.filter((p) => p.action === 'update')

console.log(`${body.dry_run ? 'DRY RUN' : 'WROTE'}  author=@${body.author}  ${base}`)
for (const p of body.plan) console.log(`  ${p.action.padEnd(6)} ${p.slug}`)
console.log(`${created.length} created, ${updated.length} updated`)
if (body.dry_run) console.log('Nothing was written. Re-run with --write to apply.')
