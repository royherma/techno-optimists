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

await check('a real Challenge page renders', async () => {
  // The check that was missing when every /c/* on prod 404'd while the API
  // served all of them 200. Only the bogus-slug 404 above was asserted, so all
  // 14 checks passed with the detail pages completely broken.
  //
  // The cause was a build, not a route: `deploy:prod` points getStaticPaths at
  // the prod API, which returned nothing usable, so Astro emitted zero pages -
  // and the shell fallback in apps/api/src/index.ts needs an existing built
  // page to borrow, so it could not fire either.
  //
  // The slug comes from the feed rather than a constant: a hardcoded one rots
  // with the corpus, and would fail on an empty database for the wrong reason.
  const feed = await (await fetch(`${BASE}/api/challenges?limit=1`)).json()
  const c0 = feed.challenges?.[0]
  if (!c0) return { ok: true, detail: 'no Challenges yet - nothing to render' }

  const r = await fetch(`${BASE}/c/${c0.slug}`)
  const html = await r.text()
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '(no title)'
  // Either path is correct: a prerendered page, or the live shell that fills
  // itself from the API. Both must answer 200 and carry the challenge sheet.
  const isSheet = /challenge-detail/.test(html)
  return {
    ok: r.status === 200 && isSheet,
    detail: `${r.status} /c/${c0.slug} "${title}"${isSheet ? '' : ' (no challenge sheet in HTML)'}`,
  }
})

await check('sign-in accepts a request', async () => {
  const r = await fetch(`${BASE}/api/auth/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `deploy-probe-${Date.now()}@example.com` }),
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

await check('security headers are on every page', async () => {
  // These are set in one place (the fetch wrapper in apps/api/src/index.ts), so
  // a route added later cannot miss them - but a bad deploy can drop all of
  // them at once, which is exactly the failure this catches. frame-ancestors is
  // checked on the header specifically: a <meta> CSP cannot carry it, so if it
  // is missing here the page is frameable no matter what the HTML says.
  const r = await fetch(BASE)
  const h = (n) => r.headers.get(n) ?? ''
  const missing = []
  if (!h('content-security-policy').includes("frame-ancestors 'none'")) missing.push('CSP frame-ancestors')
  if (!/max-age=\d{7,}/.test(h('strict-transport-security'))) missing.push('HSTS')
  if (h('x-content-type-options') !== 'nosniff') missing.push('nosniff')
  if (!h('referrer-policy')) missing.push('Referrer-Policy')
  return { ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : 'CSP, HSTS, nosniff, Referrer-Policy' }
})

await check('page CSP permits data-driven styles', async () => {
  const html = await (await fetch(BASE)).text()
  const policy = html.match(/<meta[^>]+http-equiv="content-security-policy"[^>]+content="([^"]+)"/i)?.[1] ?? ''
  const attr = /(?:^|;)\s*style-src-attr\s+([^;]+)/.exec(policy)?.[1] ?? ''
  const script = /(?:^|;)\s*script-src\s+([^;]+)/.exec(policy)?.[1] ?? ''
  return {
    ok: attr.includes("'unsafe-inline'") && script.includes("'sha256-") && !script.includes("'unsafe-inline'"),
    detail: 'inline style attributes allowed; scripts still require hashes',
  }
})

await check('page CSP carries script hashes', async () => {
  // Astro computes a sha256 per inline script at build time and emits them in a
  // <meta> CSP. If this is absent the page still renders - which is why it
  // needs asserting - but every inline script on it is unprotected.
  const html = await (await fetch(BASE)).text()
  const meta = html.match(/<meta http-equiv="content-security-policy" content="([^"]*)"/i)?.[1] ?? ''
  const hashes = (meta.match(/'sha256-/g) ?? []).length
  return { ok: hashes > 0, detail: hashes ? `${hashes} hash(es) in page CSP` : 'no meta CSP on the page' }
})

await check('sign-in is rate limited', async () => {
  // The limit is 5/hour per address. Six requests from one fresh address must
  // end in a 429; if they all pass, the limiter is not deployed and anyone can
  // mailbomb a stranger from our domain.
  //
  // A unique address per run, so this never eats a real person's allowance and
  // never depends on what a previous run left behind.
  const probe = `rl-probe-${Date.now()}@technooptimists.org`
  let last = 0
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${BASE}/api/auth/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: probe }),
    })
    last = r.status
    if (r.status === 429) break
  }
  return { ok: last === 429, detail: last === 429 ? '429 within 6 requests' : `6 requests, none refused (last ${last})` }
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

await check('a profile carries no address', async () => {
  // The one privacy guarantee with a public URL behind it. Unit tests assert
  // the shape against a stub; this asserts it against whatever is actually
  // deployed, which is the only version that can leak.
  //
  // Any handle will do - a 404 proves the route is wired and answering, and a
  // 200 gets its body searched. Both are a pass as long as no address appears.
  const r = await fetch(`${BASE}/api/people/roy`)
  const text = await r.text()
  const leaked = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text)
  return {
    ok: !leaked && [200, 404].includes(r.status),
    detail: leaked ? `LEAKED an address in ${r.status}` : `${r.status}, no address in ${text.length} bytes`,
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
