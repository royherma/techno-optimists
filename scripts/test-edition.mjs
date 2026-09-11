/** Default edition, explicit opt-out, deep links, and storage-denied regression checks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const layout = readFileSync(new URL('../apps/web/src/layouts/Base.astro', import.meta.url), 'utf8')
const script = layout.split('<script>')[1].split('</script>')[0].replace(/import .*from .*\n/, '')
const helpers = readFileSync(new URL('../apps/web/src/lib/edition.ts', import.meta.url), 'utf8').replaceAll('export ', '').replaceAll('path: string', 'path')
const cases = [
  ['/', null, false, '/v2'],
  ['/map?type=idea#places', null, false, '/v2/map?type=idea#places'],
  ['/settings', '1', false, null],
  ['/settings?v=2', '1', false, '/v2/settings'],
  ['/settings?v=1', '2', false, null],
  ['/v2/map?v=1#places', '2', false, '/map?v=1#places'],
  ['/v2/map', '1', false, null],
  ['/settings', null, true, '/v2/settings'],
  ['/settings?v=1', null, true, null],
  ['/v2/settings?v=1', null, true, '/settings?v=1'],
  ['/c/new-challenge', null, false, '/v2/c/new-challenge'],
]
for (const [path, stored, blocked, expected] of cases) {
  let value = stored, redirect = null
  runInNewContext(helpers + script, {
    URL, location: { href: 'https://technooptimists.org' + path, replace: url => { redirect = url.replace('https://technooptimists.org', '') } },
    sessionStorage: {
      getItem() { if (blocked) throw new Error('Storage disabled'); return value },
      setItem(key, next) { if (blocked) throw new Error('Storage disabled'); value = next },
    },
  })
  assert.equal(redirect, expected, path + ' stored=' + stored + ' blocked=' + blocked)
}
console.log(cases.length + ' edition routing checks passed')
