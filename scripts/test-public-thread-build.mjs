// Run after a production-data build: node scripts/test-public-thread-build.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { threadPageTitle } from '../apps/web/src/lib/thread-title.mjs'
const dist = new URL('../apps/web/dist/', import.meta.url)
const read = path => readFile(new URL(path, dist), 'utf8')
const SUFFIX = ' - Techno Optimists'
const decode = text => text
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const metaContent = (html, attribute) => decode(html.match(new RegExp(`<meta ${attribute} content="([^"]*)"`))?.[1] ?? '')
assert.equal(threadPageTitle('a'.repeat(45)), `${'a'.repeat(45)}${SUFFIX}`, '45 chars keeps the suffix')
assert.equal(threadPageTitle('a'.repeat(46)), 'a'.repeat(46), '46 chars drops the suffix')
const routes = (await readdir(new URL('c/', dist))).filter(slug => slug !== '_shell')
assert.ok(routes.length > 50, 'fixture/build must exercise more than one public feed page')
const sitemap = await read('sitemap-0.xml')
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1])
assert.equal(new Set(locations).size, locations.length, 'no duplicate sitemap URLs')
for (const slug of routes) {
  for (const prefix of ['', 'v1/']) {
    const html = await read(`${prefix}c/${slug}/index.html`)
    assert.ok(!html.includes('name="robots" content="noindex"'), `${prefix}${slug} indexable`)
    assert.ok(html.includes(`rel="canonical" href="https://technooptimists.org/c/${slug}"`), `${prefix}${slug} canonical`)
    assert.ok(!html.includes('<title>Thread - Techno Optimists</title>'), `${prefix}${slug} has title`)
    const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')
    const thread = title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title
    assert.equal(title, threadPageTitle(thread), `${prefix}${slug} title follows the 45 char rule`)
    assert.equal(metaContent(html, 'property="og:title"'), title, `${prefix}${slug} og:title`)
    assert.equal(metaContent(html, 'name="twitter:title"'), title, `${prefix}${slug} twitter:title`)
    assert.match(html, /<h1[ >]/, `${prefix}${slug} rendered heading`)
  }
  assert.ok(locations.includes(`https://technooptimists.org/c/${slug}`), `${slug} in sitemap`)
}
for (const route of ['settings', 'signin', 'people', '404', 'c/_shell', 'v1/c/_shell']) {
  const html = await read(route === '404' ? '404.html' : `${route}/index.html`)
  assert.ok(html.includes('name="robots" content="noindex"'), `${route} stays noindex`)
  assert.ok(!html.includes('rel="canonical"'), `${route} has no canonical`)
}
assert.ok(locations.every(url => !url.includes('/c/_shell') && !url.includes('/people') && !url.includes('/v1/')), 'shell, people and duplicate edition excluded')
assert.ok(locations.every(url => !/^\/(settings|signin)\/?$/.test(new URL(url).pathname)), 'noindex settings and signin excluded')
for (const route of ['contribute', 'v1/contribute']) {
  const html = await read(`${route}/index.html`)
  const article = html.slice(html.indexOf('<p>You can help Techno Optimists in three ways'))
  const figure = article.indexOf('<figure class="tg-figure" id="fig-technooptimists-three-ways-to-help"')
  assert.ok(article.length < html.length, `${route} summary rendered`)
  assert.ok(figure > 0 && figure < article.indexOf('<h2>Why this exists</h2>'), `${route} summary, then figure, then Why this exists`)
  assert.match(html, /<img src="\/images\/diagrams\/technooptimists-three-ways-to-help\.svg" width="960" height="464" alt="Three ways to help Techno Optimists\. [^"]+"/, `${route} figure img and alt`)
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]).find(body => body.includes('"ImageObject"'))
  assert.equal(JSON.parse(ld).contentUrl, '/images/diagrams/technooptimists-three-ways-to-help.svg', `${route} ImageObject JSON-LD`)
  const csp = html.match(/http-equiv="content-security-policy" content="([^"]*)"/i)?.[1] ?? ''
  assert.ok(csp.includes(`sha256-${createHash('sha256').update(ld).digest('base64')}`), `${route} ImageObject JSON-LD allowed by CSP`)
}
await readFile(new URL('images/diagrams/technooptimists-three-ways-to-help.svg', dist))
for (const url of locations) {
  const path = new URL(url).pathname.replace(/^\/|\/$/g, '')
  const html = await read(path ? `${path}/index.html` : 'index.html')
  assert.ok(!/<meta[^>]+name="robots"[^>]*noindex/.test(html), `${url} is in the sitemap but noindex`)
}
console.log(`${routes.length} public routes in both editions; unique sitemap; private/noindex surfaces preserved; contribute figure present`)
