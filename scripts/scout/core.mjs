import { load } from 'cheerio'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { createHash } from 'node:crypto'

export const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex')
export const normalize = x => String(x ?? '').replace(/\s+/g, ' ').trim()
export function canonical(raw) {
  const u = new URL(raw)
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('invalid source URL')
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k)
  return u.href
}
export function publicIP(ip) {
  if (isIP(ip) === 6) return /^2[0-9a-f]{3}:/i.test(ip) && !ip.startsWith('2001:db8:')
  if (isIP(ip) !== 4) return false
  const [a,b] = ip.split('.').map(Number)
  return !([0,10,127].includes(a) || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19].includes(b))
}
export async function fetchPublic(raw, headers = {}) {
  let url = canonical(raw)
  for (let redirects = 0; redirects < 6; redirects++) {
    const u = new URL(url)
    if (u.port && !['80','443'].includes(u.port)) throw Error('nonstandard source port')
    const addresses = await lookup(u.hostname.replace(/^\[|\]$/g, ''), { all: true })
    if (!addresses.length || addresses.some(x => !publicIP(x.address))) throw Error('nonpublic source address')
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'TechnoOptimistsScout/1.0 (+https://technooptimists.org)', ...headers }, signal: AbortSignal.timeout(25000) })
    if ([301,302,303,307,308].includes(res.status)) { await res.body?.cancel(); url = canonical(new URL(res.headers.get('location'), url)); continue }
    if (!res.ok) { await res.body?.cancel(); throw Error(`HTTP ${res.status}`) }
    let bytes = 0, chunks = []
    for await (const chunk of res.body) { bytes += chunk.length; if (bytes > 3_000_000) throw Error('source exceeds 3MB'); chunks.push(chunk) }
    return { url, text: Buffer.concat(chunks).toString('utf8'), contentType: res.headers.get('content-type') ?? '' }
  }
  throw Error('too many redirects')
}
export function extract(html, url) {
  const $ = load(html)
  const title = normalize($('meta[property="og:title"]').attr('content') || $('title').text())
  const date = $('meta[property="article:published_time"]').attr('content') || $('meta[name="citation_publication_date"]').attr('content') || $('time[datetime]').first().attr('datetime') || null
  $('script,style,nav,footer,header,aside,noscript,form').remove()
  const body = $('article').length ? $('article').text() : $('main').length ? $('main').text() : $('body').text()
  return { url, title, date, text: normalize(body).slice(0,24000) }
}
const types = ['PROBLEM','IDEA','EXPERIMENT','BUILD']
const stages = ['SPOT','UNDERSTAND','IDEAS','BUILD','TEST','LEARN','IMPROVE']
export function gate(c, source, now = new Date()) {
  const reasons = []
  if (!c || typeof c !== 'object') return ['invalid model output']
  if (!types.includes(c.type) || !stages.includes(c.stage)) reasons.push('invalid type or stage')
  if (!/\d/.test(c.headline ?? '')) reasons.push('no measurable number in headline')
  if (normalize(c.headline).split(' ').length > 14) reasons.push('headline too long')
  if (!/^(this\b|my\b|our\b|i\b)/i.test(c.headline ?? '')) reasons.push('headline needs a specific subject')
  if (!c.body || c.body.length < 10 || c.body.length > 280) reasons.push('missing or long body')
  if (!c.location?.place || !c.location?.country || !source.text.toLowerCase().includes(c.location.place.toLowerCase())) reasons.push('place not grounded in source')
  if (!c.evidence?.quote || normalize(c.evidence.quote).split(' ').length > 15 || !source.text.includes(normalize(c.evidence.quote))) reasons.push('number evidence not a short exact source quote')
  const numbers = String(c.headline ?? '').match(/\d+(?:[.,]\d+)*/g) ?? []
  if (numbers.some(n => !String(c.evidence?.quote).includes(n))) reasons.push('headline number not in evidence')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.source_date ?? '') || !Number.isFinite(Date.parse(c.source_date)) || Date.parse(c.source_date) > +now) reasons.push('missing or invalid source date')
  else if (!String(source.date ?? source.text).includes(c.source_date) && !(c.date_evidence && source.text.includes(c.date_evidence))) reasons.push('date not grounded in source')
  if (Date.parse(c.source_date) < +now - 3*365.25*86400000) reasons.push('source older than three years; current status needs review')
  if (!Number.isInteger(c.impact_rings) || c.impact_rings < 1 || c.impact_rings > 5 || !c.impact_reason) reasons.push('missing impact reasoning')
  if (!['unsolved','partially_solved','solved_elsewhere','unknown'].includes(c.status)) reasons.push('invalid solution status')
  if (c.status === 'unknown') reasons.push('solution status unknown')
  if (c.status === 'solved_elsewhere' && (c.type === 'PROBLEM' || !['LEARN','IMPROVE'].includes(c.stage))) reasons.push('solved example must be restaged')
  if (!Array.isArray(c.tags) || !c.tags.length || c.tags.length > 6 || c.tags.some(x=>typeof x !== 'string' || x.length < 2 || x.length > 30)) reasons.push('invalid tags')
  if (!c.problem_key) reasons.push('missing problem dedupe key')
  if (!c.image_subject) reasons.push('missing illustration subject')
  if (new URL(source.url).pathname.split('/').filter(Boolean).length === 0) reasons.push('homepage')
  return reasons
}
export function toImport(c) {
  if (!types.includes(c.type) || !stages.includes(c.stage) || typeof c.headline !== 'string' || c.headline.length < 8 || c.headline.length > 140 || typeof c.body !== 'string' || c.body.length < 10 || c.body.length > 280 || !Number.isInteger(c.impact_rings) || c.impact_rings < 1 || c.impact_rings > 5 || !Array.isArray(c.tags) || c.tags.length > 6 || c.tags.some(t=>typeof t !== 'string' || t.length < 2 || t.length > 30)) throw Error('card does not match import schema; correct it before approval')
  canonical(c.source.url)

  return { type:c.type.toLowerCase(), stage:c.stage.toLowerCase(), title:c.headline, summary:c.body,
    location:`${c.location.place}, ${c.location.country}`, ...(Number.isFinite(c.location.lat) && Number.isFinite(c.location.lng) ? {lat:c.location.lat, lng:c.location.lng} : {}),
    image_subject:c.image_subject, tags:c.tags, impact:c.impact_rings, source_url:c.source.url, source_name:c.source.outlet,
    source_note:`${c.source.confirms} | ${c.status_note} | Impact: ${c.impact_reason}`.slice(0,2000),
    created_at:c.source.date, last_activity_at:c.source.date }
}
