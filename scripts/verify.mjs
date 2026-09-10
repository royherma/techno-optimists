/**
 * Checks a deployed environment answers correctly, and says which hop broke.
 *
 *   npm run verify            # prod (technooptimists.org)
 *   npm run verify:dev        # the dev worker
 *   node scripts/verify.mjs --base https://example.com
 *
 * Every check prints its real artifact - status code, body, TLS result - because
 * the failures here have all been layered: a browser "site can't be reached"
 * that was a registry delegation, a "CORS error" that was a worker that never
 * ran, a cached 404.html that read as an expired link. The outermost message
 * has never once named the cause, so this prints each layer separately.
 *
 * Exit code is the number of failed checks, so CI and `&&` chains work.
 */

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : process.argv[i + 1]
}

const BASE = (arg('--base') ?? process.env.TO_BASE ?? 'https://technooptimists.org').replace(/\/$/, '')

const results = []
const check = async (name, fn) => {
  try {
    const { ok, detail } = await fn()
    results.push({ name, ok, detail })
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(34)} ${detail}`)
  } catch (err) {
    results.push({ name, ok: false, detail: String(err.message ?? err) })
    console.log(`FAIL  ${name.padEnd(34)} ${err.message ?? err}`)
  }
}

console.log(`\nverifying ${BASE}\n`)

await check('DNS resolves', async () => {
  // fetch() fails with the same opaque error for DNS, TLS and connection
  // refused. Separating them is the whole point of this script, so resolve
  // through DoH rather than trusting the local resolver's cache.
  const host = new URL(BASE).hostname
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
    headers: { accept: 'application/dns-json' },
  })
  const d = await r.json()
  const ips = (d.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
  return { ok: ips.length > 0, detail: ips.length ? ips.join(', ') : `no A record (status ${d.Status})` }
})

await check('GET / is the site', async () => {
  const r = await fetch(BASE)
  const html = await r.text()
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '(no title)'
  return { ok: r.ok && /Techno Optimists/.test(title), detail: `${r.status} "${title}"` }
})

await check('GET /api/health', async () => {
  const r = await fetch(`${BASE}/api/health`)
  const body = (await r.text()).slice(0, 80)
  return { ok: r.ok, detail: `${r.status} ${body}` }
})

await check('feed returns JSON', async () => {
  const r = await fetch(`${BASE}/api/challenges`)
  const d = await r.json()
  const n = d.challenges?.length
  return { ok: Array.isArray(d.challenges), detail: `${r.status} ${n} challenge(s)` }
})

await check('worker answers /api, not assets', async () => {
  // `run_worker_first` exists because the asset worker used to answer /api/*
  // and edge-cache the result. A cached 404.html here broke sign-in outright.
  const r = await fetch(`${BASE}/api/definitely-not-a-route`)
  const isHtml = (r.headers.get('content-type') ?? '').includes('text/html')
  return { ok: !isHtml, detail: `${r.status} content-type=${r.headers.get('content-type')}` }
})

await check('missing page serves 404', async () => {
  const r = await fetch(`${BASE}/c/definitely-not-a-slug`)
  const body = await r.text()
  return { ok: r.status === 404 && body.length > 0, detail: `${r.status}, ${body.length} bytes` }
})

await check('sign-in accepts a request', async () => {
  const r = await fetch(`${BASE}/api/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'claude-e2e-probe@example.com' }),
  })
  const d = await r.json()
  // dev_link in a prod response would mean anyone POSTing a stranger's address
  // gets a bearer token for their account. This is the one check that must
  // behave DIFFERENTLY per environment.
  const isProd = !/workers\.dev/.test(BASE)
  const leaked = isProd && 'dev_link' in d
  return {
    ok: r.ok && !leaked,
    detail: leaked ? 'LEAKED dev_link in prod' : `${r.status} sent=${d.sent} dev_link=${'dev_link' in d}`,
  }
})

await check('sitemap is XML, not the 404 page', async () => {
  // robots.txt names one sitemap URL. If that URL serves the 404 HTML page,
  // Search Console rejects the submission and reports "couldn't fetch" - which
  // reads as a network problem rather than a wrong filename.
  const robots = await (await fetch(`${BASE}/robots.txt`)).text()
  const named = robots.match(/^Sitemap:\s*(\S+)/mi)?.[1]
  if (!named) return { ok: false, detail: 'robots.txt names no sitemap' }
  const r = await fetch(named)
  const ctype = r.headers.get('content-type') ?? ''
  return {
    ok: r.status === 200 && ctype.includes('xml'),
    detail: `${named} -> ${r.status} ${ctype}`,
  }
})

await check('a server error carries a ray', async () => {
  // /api/_throw exists to fail. Asserting the shape of a healthy response
  // proves nothing: every route working is indistinguishable from a missing
  // boundary, which is how the sign-in outage stayed opaque. This makes one
  // error happen and reads what came back.
  //
  // In prod the route 404s on purpose - a public endpoint that reliably 500s
  // fills logs for free - so there the check is that it is NOT reachable.
  const isProd = !/workers\.dev/.test(BASE)
  const r = await fetch(`${BASE}/api/_throw`)
  const d = await r.json().catch(() => ({}))
  if (isProd) {
    return { ok: r.status === 404, detail: `${r.status} (must not be reachable in prod)` }
  }
  return {
    ok: r.status === 500 && typeof d.ray === 'string' && d.ray.length > 0
      && !JSON.stringify(d).includes('deliberate'),
    detail: `${r.status} ray=${d.ray ?? 'MISSING'} leak=${JSON.stringify(d).includes('deliberate')}`,
  }
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed\n`)
if (failed.length) {
  console.log('failed:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  console.log('')
}
process.exit(failed.length)
