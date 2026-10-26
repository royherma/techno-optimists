import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPublicThreads } from '../apps/web/src/lib/api.ts'

const rows = (start, count) => Array.from({ length: count }, (_, i) => ({ slug: `public-${start + i}` }))
function feed(t, pages) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    assert.match(url, /^http:\/\/127\.0\.0\.1:8791\/api\/challenges\?limit=50&offset=\d+$/)
    const page = pages.shift()
    if (page instanceof Error) throw page
    return new Response(JSON.stringify(page.body ?? page), { status: page.status ?? 200 })
  })
  return calls
}
test('all 83 anonymous public threads are returned using offset pagination', async t => {
  const calls = feed(t, [{ challenges: rows(0, 50), next_cursor: '50' }, { challenges: rows(50, 33), next_cursor: null }])
  const result = await getPublicThreads()
  assert.equal(result.length, 83)
  assert.equal(new Set(result.map(c => c.slug)).size, 83)
  assert.equal(result[82].slug, 'public-82')
  assert.equal(calls.length, 2)
  assert.ok(calls[1].endsWith('offset=50'))
  // No account/person detail or other private endpoint is enumerated.
  assert.ok(result.every(c => c.slug.startsWith('public-')))
})
test('overlapping pages produce each route once', async t => {
  feed(t, [{ challenges: rows(0, 50), next_cursor: '50' }, { challenges: rows(49, 3), next_cursor: null }])
  assert.equal((await getPublicThreads()).length, 52)
})
for (const count of [0, 12, 50]) test(`terminal page of ${count} rows stops immediately`, async t => {
  const calls = feed(t, [{ challenges: rows(0, count), next_cursor: null }])
  assert.equal((await getPublicThreads()).length, count)
  assert.equal(calls.length, 1)
})
for (const next_cursor of ['0', '-1', 'bad', '', '1.5', '9007199254740992']) test(`rejects invalid/nonadvancing offset ${next_cursor}`, async t => {
  feed(t, [{ challenges: rows(0, 50), next_cursor }])
  await assert.rejects(getPublicThreads(), /pagination did not advance/)
})
test('repeated or empty nonterminal pages fail instead of looping', async t => {
  feed(t, [{ challenges: rows(0, 50), next_cursor: '50' }, { challenges: rows(0, 50), next_cursor: '100' }])
  await assert.rejects(getPublicThreads(), /pagination did not advance/)
})
test('an empty nonterminal first page fails', async t => {
  feed(t, [{ challenges: [], next_cursor: '50' }])
  await assert.rejects(getPublicThreads(), /pagination did not advance/)
})
for (const failure of [{ status: 503, body: {} }, new Error('offline')]) test('later-page failures never return a partial route list', async t => {
  feed(t, [{ challenges: rows(0, 50), next_cursor: '50' }, failure])
  await assert.rejects(getPublicThreads(), /feed 503|offline/)
})
