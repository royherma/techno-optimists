// Local end-to-end API check and a realistic corpus for browser QA. This script
// deliberately refuses every remote host; test conversations never go to prod.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const base = process.argv[2] ?? 'http://localhost:8795'
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local hosts only')
let cookie = ''
async function api(path, method = 'GET', body) {
  return fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
const auth = await api('/api/auth/request', 'POST', { email: 'royherma@gmail.com' })
assert.equal(auth.status, 200)
const { dev_link } = await auth.json()
assert(dev_link, 'A local-only magic link is required')
const login = await fetch(dev_link, { redirect: 'manual' })
cookie = login.headers.getSetCookie().find((v) => v.startsWith('to_session=')).split(';')[0]
const raw = JSON.parse(readFileSync(new URL('../docs/2026-09-11-seed-batch-01.json', import.meta.url), 'utf8'))
const imported = await api('/api/challenges/import', 'POST', { author: 'atlas', dry_run: false, challenges: raw.challenges ?? raw })
assert.equal(imported.status, 201, await imported.text())
const slug = 'tokyo-cut-its-crows-under-fifth'
const before = await (await api(`/api/challenges/${slug}`)).json()
const body = { body: 'Local QA: could covered collection bins help here?', kind: 'question', request_id: crypto.randomUUID() }
const created = await api(`/api/challenges/${slug}/comments`, 'POST', body)
assert.equal(created.status, 201)
const { id } = await created.json()
assert.equal((await api(`/api/challenges/${slug}/comments`, 'POST', body)).status, 200)
assert.equal((await api(`/api/challenges/${slug}/comments`, 'POST', { ...body, parent_id: id, body: 'Local QA reply: compare collection points before and after the change.', request_id: crypto.randomUUID() })).status, 201)
const comments = await (await api(`/api/challenges/${slug}/comments`)).json()
assert(comments.comments.some((c) => c.parent_id === id))
assert.equal(comments.comments.filter((c) => c.id === id).length, 1)
const after = await (await api(`/api/challenges/${slug}`)).json()
assert.equal(after.updates.length, before.updates.length)
assert.equal(after.challenge.stage, before.challenge.stage)
assert.equal((await api(`/api/challenges/${slug}/editorial`, 'PATCH', { emoji: '🐦' })).status, 200)
assert.equal((await (await api(`/api/challenges/${slug}`)).json()).challenge.emoji, '🐦')
assert.equal((await fetch(`${base}/api/challenges/${slug}/editorial`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: '🌱' }) })).status, 401)
const fresh = await api('/api/challenges', 'POST', { type: 'problem', title: `Local discussion routing check ${Date.now()}`, summary: 'A local-only fixture for checking a Challenge created after the build.' })
assert.equal(fresh.status, 201)
const { challenge } = await fresh.json()
const page = await fetch(`${base}/c/${challenge.slug}`)
assert.equal(page.status, 200, 'New Challenge must have a working page before rebuilding')
assert((await page.text()).includes('ChallengeDetail'))
console.log(`New-page browser check: ${base}/c/${challenge.slug}`)
console.log('Local API passed: import, comments, replies, retry, stage isolation, admin emoji, anonymous denial, and new-page routing.')
