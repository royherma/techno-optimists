/**
 * The newspaper is the site and owns the bare paths; Classic lives under /v1.
 *
 * This used to exercise a client-side redirect in Base.astro that sent every
 * bare path to its /v2 twin on load. That script is gone - it was the reason
 * typing technooptimists.org landed you on technooptimists.org/v2 - so what is
 * left to check is the path helpers themselves, which is what the newspaper
 * shell uses to point the Classic switch at the right screen.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const helpers = readFileSync(new URL('../apps/web/src/lib/edition.ts', import.meta.url), 'utf8')
  .replaceAll('export ', '')
  .replaceAll('path: string', 'path')
const { editionPath, classicPath } = runInNewContext(helpers + '\n;({ editionPath, classicPath })', { URL })

// [input, editionPath(input), classicPath(input)]
const cases = [
  ['/', '/', '/v1'],
  ['/map', '/map', '/v1/map'],
  ['/c/example', '/c/example', '/v1/c/example'],
  ['/people?handle=roy#work', '/people?handle=roy#work', '/v1/people?handle=roy#work'],
  // Already in the target edition: both helpers are idempotent, so a second
  // rewrite of an href the MutationObserver has already seen changes nothing.
  ['/v1', '/', '/v1'],
  ['/v1/map', '/map', '/v1/map'],
  ['/v1/c/example', '/c/example', '/v1/c/example'],
]
for (const [input, edition, classic] of cases) {
  assert.equal(editionPath(input), edition, `editionPath(${input})`)
  assert.equal(classicPath(input), classic, `classicPath(${input})`)
}

// Worker-served and external URLs are never prefixed: /v1/api/... would 404.
for (const path of ['/api/auth/callback', '/media/example.jpg', '/_astro/app.js', 'https://example.com', '//example.com', '#discussion']) {
  assert.equal(editionPath(path), path, `editionPath left ${path} alone`)
  assert.equal(classicPath(path), path, `classicPath left ${path} alone`)
}

// The redirect must stay deleted. A reintroduced one is the original bug.
const layout = readFileSync(new URL('../apps/web/src/layouts/Base.astro', import.meta.url), 'utf8')
assert.ok(!/location\.replace/.test(layout), 'Base.astro must not redirect between editions')

console.log(cases.length * 2 + 12 + 1 + ' edition routing checks passed')
