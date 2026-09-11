/**
 * Walks the whole sign-in flow against a deployed environment and says which
 * step broke. Every previous auth bug here was invisible because the failure
 * surfaced two layers above its cause: a cached 404 read as "link expired", a
 * consumed token read as "React is broken". This prints each hop's real status.
 *
 *   node scripts/auth-doctor.mjs                    # probe address, safe
 *   node scripts/auth-doctor.mjs --email you@x.com  # a real inbox
 *
 * The probe address never receives mail (Resend rejects unverified domains),
 * which is the point: the token comes back in `dev_link` and no real inbox is
 * touched. Redeeming a token CONSUMES it - never point --email at an address
 * whose link a human is about to click.
 */

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : process.argv[i + 1]
}

// No hardcoded default: the dev worker's address contains a Cloudflare subdomain
// specific to one account, and this repo is public. Set TO_BASE or pass --base.
const BASE = (arg('--base') ?? process.env.TO_BASE ?? '').replace(/\/$/, '')
if (!BASE) {
  console.error('No target. Set TO_BASE or pass --base https://your-worker.workers.dev')
  process.exit(2)
}

const EMAIL = arg('--email') ?? 'claude-e2e-probe@example.com'

/**
 * `--inspect <token-or-url>` answers "why did THIS link fail?" without spending
 * it. Hashing the token and reading the row tells us which of the four states
 * it is in - the callback would tell us the same thing and consume the link
 * doing it, which is how a reader's one live link kept disappearing.
 */
const INSPECT = arg('--inspect')
if (INSPECT) {
  const token = INSPECT.match(/token=([0-9a-f]+)/)?.[1] ?? INSPECT.trim()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  console.log(`token  ${token.slice(0, 16)}...\nhash   ${hash}\n`)
  console.log('Read the row with:')
  console.log(`  npx wrangler d1 execute techno-optimists-dev --remote --json --command "SELECT email, used_at, expires_at, datetime('now') now FROM magic_links WHERE token_hash='${hash}';"`)
  console.log('\nno row      -> the link was superseded by a newer request (error=unknown)')
  console.log('used_at set -> already redeemed (error=used)')
  console.log('expires_at past -> timed out (error=expired)')
  process.exit(0)
}

let failed = false
const step = (ok, label, detail) => {
  if (!ok) failed = true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

/** Cloudflare can serve an asset instead of running the Worker; that is a real bug class here. */
const cacheNote = (res) => {
  const s = res.headers.get('cf-cache-status')
  return s ? `cf-cache-status=${s}` : ''
}

console.log(`base  ${BASE}\nemail ${EMAIL}\n`)

// 1. Ask for a link.
const reqRes = await fetch(`${BASE}/api/auth/request`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL }),
})
const reqBody = await reqRes.json().catch(() => ({}))
step(reqRes.ok, 'POST /api/auth/request', `HTTP ${reqRes.status} sent=${reqBody.sent} ${cacheNote(reqRes)}`)

// `sent:false` with a dev_link is expected for the probe address and is not a
// failure of the flow - it means Resend declined the recipient, not that mail
// is broken. For a real address it is the opposite: no mail went out.
if (reqBody.sent === false && EMAIL !== 'claude-e2e-probe@example.com') {
  step(false, 'mail delivery', 'sent=false for a real address - check RESEND_API_KEY on this env')
}

const link = reqBody.dev_link
if (!link) {
  step(false, 'token available', 'no dev_link in the response - cannot redeem without reading D1')
  console.log('\nA real address does not return the token by design. Read it from the mail, or use the probe address.')
  process.exit(1)
}

// 2. Redeem it exactly as a browser would.
const cbRes = await fetch(link, {
  redirect: 'manual',
  headers: {
    accept: 'text/html,application/xhtml+xml',
    'user-agent': 'auth-doctor',
  },
})
const location = cbRes.headers.get('location')
const setCookie = cbRes.headers.get('set-cookie')
step(cbRes.status === 302, 'GET /api/auth/callback', `HTTP ${cbRes.status} -> ${location} ${cacheNote(cbRes)}`)

// A 200 here means the asset worker answered instead of the script: the exact
// failure that made sign-in return a 404 page with cf-cache-status HIT.
if (cbRes.status === 200) {
  step(false, 'worker ran', 'got 200, not a redirect - an asset was served instead of the Worker')
}
step(Boolean(setCookie), 'session cookie issued', setCookie ? setCookie.split(';')[0].slice(0, 24) + '...' : 'none')
step(location === '/' || Boolean(location), 'redirect target', String(location))

// An error redirect carries the reason in the query string; name it plainly.
if (location && location.includes('error=')) {
  step(false, 'redeem outcome', `callback rejected the token: ${location}`)
}

// 3. Prove the cookie actually authenticates.
const token = setCookie?.match(/to_session=([^;]+)/)?.[1]
if (token) {
  const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: `to_session=${token}` } })
  const me = await meRes.json().catch(() => ({}))
  step(meRes.ok && Boolean(me.person), 'GET /api/auth/me', `HTTP ${meRes.status} person=${me.person?.handle ?? 'null'}`)

  // The control: the same endpoint with no cookie must NOT return a person, or
  // "signed in" means nothing.
  const anonRes = await fetch(`${BASE}/api/auth/me`)
  const anon = await anonRes.json().catch(() => ({}))
  step(!anon.person, 'anonymous is not signed in', `person=${anon.person?.handle ?? 'null'}`)
} else {
  step(false, 'GET /api/auth/me', 'no cookie to replay')
}

// A full pass proves the flow works for a NEW account, which is exactly what it
// looks like after `db:reset:dev` wipes the identities table: every step green
// while a real person's account and links no longer exist. That reset is shared
// - the dev D1 is remote, so another session running it deletes live links out
// from under whoever is mid-sign-in. Say so, since 6/6 PASS otherwise hides it.
console.log('\nIf a real person reports failure while this passes, check their rows survived:')
console.log('  npx wrangler d1 execute techno-optimists-dev --remote --command \\')
console.log('    "SELECT (SELECT COUNT(*) FROM identities) ids, (SELECT COUNT(*) FROM magic_links) links;"')
console.log('  ids=1 (only this probe) means the database was reset and their link is gone.')

console.log(`\n${failed ? 'FAILED - the first FAIL above is the break.' : 'All steps passed.'}`)
process.exit(failed ? 1 : 0)
