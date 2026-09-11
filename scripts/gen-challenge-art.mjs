#!/usr/bin/env node
// Generates one illustration per imported Challenge and attaches it to the row.
//
//   node scripts/gen-challenge-art.mjs docs/2026-09-11-seed-batch-01.json [--write]
//
// Dry run by default: it prints the grid plan and the cost, and generates
// nothing. --write actually spends money, so the expensive direction is the one
// you ask for by name - same contract as import-challenges.mjs.
//
// TWO BACKENDS, AND THE FREE ONE IS THE DEFAULT.
//
// local (default): local-imagegen on :4750, model x/flux2-klein:4b on pinned
// Ollama 0.32.5. Costs nothing - it runs on this machine. One call per card,
// drawn straight at the card's own 4:3, because with no per-call charge there
// is nothing left for a grid to save.
//
// paid (--paid): OpenRouter google/gemini-3.1-flash-lite-image at $0.03362925
// a call, measured. Here the billing is per image rather than per pixel, so
// this path asks for a 2x2 grid and slices it into four tiles locally: nine
// cards cost ~$0.10 instead of ~$0.30. 2x2 and not 3x3 because the provider
// refuses 2K for this model ("Image size 2K is not supported for this model"),
// making 1024 the ceiling - a 3x3 tile is 341px, visibly soft in a 4:3 card,
// where a 2x2 tile is 512px.
//
// The output lands in apps/web/public/seed/<slug>.png and is attached to the
// Challenge by rewriting the batch file's `media` array, so the existing import
// route carries it: the route is idempotent on slug, so re-running the import
// updates the nine rows in place rather than duplicating them.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const GEN = join(homedir(), '.claude/skills/gen-image/gen_image.sh')
const SLICE = join(homedir(), '.claude/skills/slice-grid-image/bin/slice.py')
const SEED_DIR = 'apps/web/public/seed'
const CELLS = 4 // 2x2, paid backend only

// The card is aspect-[4/3] with object-cover (ChallengeCard.astro:15), so the
// local backend draws that ratio directly and nothing gets cropped away. 688x512
// is the 4:3 the local model has real timings for: 13.2s median, against 17.1s
// for a square that would then lose a quarter of its height to the crop.
const CARD_W = 688
const CARD_H = 512
const STEPS = 6
const LOCAL_BASE = 'http://localhost:4750'

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const paid = argv.includes('--paid')
const file = argv.find((a) => !a.startsWith('--'))

if (!file) {
  console.error('usage: gen-challenge-art.mjs <batch.json> [--write] [--paid]')
  process.exit(2)
}

/*
 * LOCAL IS THE DEFAULT, AND SPENDING MONEY HAS TO BE ASKED FOR BY NAME.
 *
 * local-imagegen (sibling folder) generates on hardware already paid for, at
 * $0, from a model pinned on Ollama 0.32.5. The first version of this script
 * ignored it and billed OpenRouter $0.0336 a call, then built a 2x2 grid to get
 * nine cards down to $0.10 - real optimisation pointed at the wrong number,
 * because the right number was zero the whole time.
 *
 * A rule written in a doc gets read past. This is the same rule as a flag, so
 * the paid path cannot be taken by a session that simply did not think to look.
 */
const BACKENDS = {
  local: { label: 'local-imagegen (x/flux2-klein:4b, $0)', perCallUsd: 0 },
  paid: { label: 'OpenRouter google/gemini-3.1-flash-lite-image', perCallUsd: 0.03362925 },
}
const backend = paid ? 'paid' : 'local'

const batch = JSON.parse(readFileSync(file, 'utf8'))
const rows = Array.isArray(batch) ? batch : batch.challenges
if (!Array.isArray(rows) || rows.length === 0) {
  console.error(`${file}: expected an array of challenges, or {author, challenges:[...]}`)
  process.exit(2)
}

// The route's own slugify, imported rather than reimplemented. A local copy
// drifted on 5 of the first 9 rows - it disagreed about apostrophes, about
// "39.8C", and about which stop words go - and every disagreement writes a PNG
// under a name no Challenge references. Node runs the .ts directly.
const { slugify } = await import('../apps/api/src/slug.ts')

/*
 * One panel description per Challenge. Deliberately concrete and physical: the
 * model draws what it is told to draw, and an abstract instruction ("depict
 * water scarcity") produces a stock-photo cliche that matches no particular
 * Challenge. Each line names objects and light, never a concept.
 *
 * Keyed by slug so a row whose title changes loudly loses its art rather than
 * quietly getting the wrong picture.
 */
const PANELS = {
  'our-rooftop-tank-hits-scalding-by':
    'a black plastic water storage tank on a flat concrete rooftop in harsh overhead sun, heat shimmer rising off the roof',
  'metal-roofed-classrooms-hit-39-8c':
    'a single-storey classroom with a corrugated metal roof under a white midday sun, dry red earth around it',
  'clinic-s-vaccine-fridge-runs-generator':
    'a small white medical refrigerator beside a petrol generator and fuel cans in a bare rural clinic room',
  'pond-s-oxygen-crashes-at-dawn':
    'a still fish pond at first light, pale pink sky, several fish floating belly-up at the surface',
  'macaques-strip-harvest-and-deterrents-cost':
    'macaque monkeys climbing a coconut palm and pulling at the fruit, a farm shed below',
  'ten-days-clear-rice-stubble-before':
    'a flat harvested rice field of cut stubble with a tractor and seed drill at the edge, low smoky haze',
  'baboons-listen-lock-beep-and-go':
    'a baboon sitting on the roof of a parked car at a coastal viewpoint, door slightly ajar',
  'tokyo-cut-its-crows-under-fifth':
    'tidy netted rubbish collection points on a clean city street at dawn, two crows perched on a wire above',
  'rainwater-tank-goes-hazy-and-smells':
    'a large rainwater storage tank beside a wooden house in summer, cloudy water visible in a glass jar on a stump',
}

const missing = rows.filter((r) => !PANELS[slugify(r.title)])
if (missing.length) {
  console.error(`${missing.length} row(s) have no panel description - add one to PANELS keyed by slug:`)
  for (const r of missing) console.error(`  - ${slugify(r.title)}  (${r.title})`)
  process.exit(1)
}

// Pack the rows into grids of four. The last grid is usually short; it is still
// asked for as a full 2x2 and the spare cells are filled with a neutral scene,
// because a model told to draw "three panels in a 2x2" reliably produces four
// anyway and the layout drifts when it improvises the fourth.
const grids = []
for (let i = 0; i < rows.length; i += CELLS) grids.push(rows.slice(i, i + CELLS))

const QUADRANT = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right']
const FILLER = 'an empty dirt path between low trees, nothing in the foreground'

/*
 * The negative is stated three ways on purpose. A single "no text" loses to the
 * model's habit of labelling objects - the first probe stamped the word WATER
 * across a tank despite being told once. Repetition in different words is what
 * actually suppresses it.
 */
const STYLE = 'flat vector editorial illustration, muted earth-tone palette, simple bold shapes, no gradients'
const NO_TEXT = 'No text anywhere. No letters, no words, no numbers, no labels, no signage, no writing on any object.'

const promptFor = (cells, { single = false } = {}) => {
  if (single) return `${cap(STYLE)}: ${PANELS[slugify(cells[0].title)]}. ${NO_TEXT}`

  const panels = Array.from({ length: CELLS }, (_, i) =>
    `${QUADRANT[i]}: ${cells[i] ? PANELS[slugify(cells[i].title)] : FILLER}.`).join(' ')
  return `A 2x2 grid of four separate ${STYLE.replace('flat vector editorial illustration', 'flat vector editorial illustrations')}, ` +
    `divided by thick black lines into four equal panels. ${panels} ${NO_TEXT}`
}

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

// Local draws one card at a time, so its "grid" is a group of one. Keeping both
// backends on the same plan shape means the reporting below has no branches.
const groups = backend === 'local' ? rows.map((r) => [r]) : grids

const plan = groups.map((cells, i) => ({
  grid: i + 1,
  cells,
  slugs: cells.map((c) => slugify(c.title)),
  prompt: backend === 'local' ? null : promptFor(cells),
}))

const calls = backend === 'local' ? rows.length : grids.length
console.log(`${write ? 'GENERATING' : 'DRY RUN'}  ${rows.length} challenges, ${calls} call(s) via ${BACKENDS[backend].label}`)
for (const p of plan) {
  const filler = backend === 'paid' && p.slugs.length < CELLS ? ` (+${CELLS - p.slugs.length} filler)` : ''
  console.log(`  ${backend === 'local' ? 'card' : 'grid'} ${p.grid}: ${p.slugs.join(', ')}${filler}`)
}
// The measured per-call price, never a modelled one. Local is free, so it says
// free rather than printing a tidy $0.0000 that looks like a rounded charge.
const cost = calls * BACKENDS[backend].perCallUsd
console.log(`  cost: ${cost === 0 ? '$0 (local hardware)' : `${calls} x $0.0336 = $${cost.toFixed(4)}`}`)

if (!write) {
  console.log('Nothing generated. Re-run with --write to apply.')
  process.exit(0)
}

mkdirSync(SEED_DIR, { recursive: true })
const work = join(tmpdir(), `challenge-art-${Date.now()}`)
mkdirSync(work, { recursive: true })

const sharp = (await import('sharp')).default
const written = []

/*
 * The local server generates to its OWN outputs/ directory and answers with
 * {saved:[{path}], errors, requested} - it hands back a path on disk, never
 * base64. Verified 2026-09-11: a probe that assumed an `image` string got
 * `top-level keys: saved, errors, requested` and no picture, while the PNG sat
 * on disk the whole time.
 */
const genLocal = async (prompt, dest) => {
  const res = await fetch(`${LOCAL_BASE}/api/gen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, width: CARD_W, height: CARD_H, steps: STEPS }),
  })
  if (!res.ok) throw new Error(`local /api/gen http ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const body = await res.json()
  for (const e of body.errors ?? []) throw new Error(`local gen failed: ${e.error ?? JSON.stringify(e)}`)

  const src = body.saved?.[0]?.path
  if (!src) throw new Error(`local gen returned no saved path. keys: [${Object.keys(body).join(', ')}]`)

  writeFileSync(dest, readFileSync(src))
}

for (const p of plan) {
  if (backend === 'local') {
    // One call per card. There is no per-call charge to amortise, so a grid
    // would buy nothing and cost sharpness - this draws straight at the card's
    // own 4:3 instead of cropping a square.
    for (const [i, slug] of p.slugs.entries()) {
      const dest = join(SEED_DIR, `${slug}.png`)
      const started = Date.now()
      process.stdout.write(`  ${slug} ... `)
      await genLocal(promptFor([p.cells[i]], { single: true }), dest)
      console.log(`${((Date.now() - started) / 1000).toFixed(1)}s`)
      written.push({ slug, dest })
    }
  } else {
    const gridPath = join(work, `grid-${p.grid}.png`)
    process.stdout.write(`grid ${p.grid}/${grids.length}: generating... `)

    // Inherits OPENROUTER_API_KEY from the environment, which is where
    // gen_image.sh reads it from. stdio inherit so its heartbeat and the Gen ID
    // land in this log rather than disappearing into a buffer.
    execFileSync('bash', [GEN, '--size', '1K', '--aspect', '1:1', '--out', gridPath, p.prompt], {
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 300_000,
    })

    if (!existsSync(gridPath)) {
      console.error(`grid ${p.grid}: gen-image exited 0 but wrote no file at ${gridPath}`)
      process.exit(1)
    }

    const tileDir = join(work, `tiles-${p.grid}`)
    execFileSync('python3', [SLICE, gridPath, '--rows', '2', '--cols', '2', '--out-dir', tileDir, '--prefix', 'panel'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    for (const [i, slug] of p.slugs.entries()) {
      writeFileSync(join(SEED_DIR, `${slug}.png`), readFileSync(join(tileDir, `panel-${i + 1}.png`)))
      written.push({ slug, dest: join(SEED_DIR, `${slug}.png`) })
    }
  }
}

// Dimensions and tint are read off the finished file rather than assumed, so
// they stay right whichever backend drew it. The card paints `tint` behind the
// image while it loads, so it wants the art's average colour - one pixel of
// resize is the cheapest honest average there is.
for (const art of written) {
  const img = sharp(art.dest)
  const meta = await img.metadata()
  const { data } = await img.clone().resize(1, 1, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true })
  art.w = meta.width
  art.h = meta.height
  art.tint = `#${[data[0], data[1], data[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  console.log(`  ${art.slug}.png  ${art.w}x${art.h}  tint ${art.tint}`)
}

/*
 * Attach the art by rewriting the batch file rather than issuing a second kind
 * of write. The import route already owns the update path and is idempotent on
 * slug, so re-running the import is what actually puts these on the Challenges.
 */
const bySlug = new Map(written.map((w) => [w.slug, w]))
for (const row of rows) {
  const art = bySlug.get(slugify(row.title))
  if (!art) continue
  row.media = [{
    kind: 'image',
    url: `/seed/${art.slug}.png`,
    w: art.w,
    h: art.h,
    tint: art.tint,
    // Alt text describes the drawing, not the Challenge: a screen reader user
    // already has the title and summary read to them right next to it.
    alt: PANELS[art.slug],
  }]
}

writeFileSync(file, `${JSON.stringify(batch, null, 2)}\n`)

console.log(`\nwrote ${written.length} png to ${SEED_DIR}/ and attached media in ${file}`)
console.log(`next: node scripts/import-challenges.mjs ${file} --base https://technooptimists.org --write`)
