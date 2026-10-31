// Run after a production-data build: node scripts/test-public-thread-build.mjs
import assert from 'node:assert/strict'
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
console.log(`${routes.length} public routes in both editions; unique sitemap; private/noindex surfaces preserved`)
