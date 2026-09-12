import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseGeocode, groundQuote, prioritizeEntries, articleDate, auditDraft, draftSchema, evidenceGate, feedLinks, fetchText, runScout, type Draft, type Source } from '../src/scout-cloudflare'
const source: Source = { url: 'https://nepalitimes.com/news/classroom', title: 'School heat', date: '2026-09-01', text: 'In Nepalganj the classroom reached 39.8 degrees during afternoon lessons.' }
const card: Draft = { eligible: true, reason: '', headline: 'This classroom reaches 39.8 degrees during lessons', body: 'The metal roof traps heat. The school has no electricity.', type: 'problem', stage: 'ideas', place: 'Nepalganj', country: 'Nepal', problem_key: 'classroom-heat', impact: 1, impact_reason: 'One classroom is documented.', severity: 'moderate', status: 'unsolved', status_note: 'No fix deployed at the source date.', confirms: 'the classroom reached 39.8 degrees', tags: ['heat'], image_subject: 'A classroom with a metal roof' }
afterEach(() => vi.unstubAllGlobals())
describe('remote Scout evidence and network boundaries', () => {
 it('accepts a grounded measurement and rejects misleading substring numbers', () => {
  expect(evidenceGate(card, source, Date.parse('2026-09-12'))).toEqual([])
  expect(evidenceGate({...card,headline:'This classroom reaches 9.8 degrees'}, source, Date.parse('2026-09-12'))).toContain('measurement_not_quoted')
 })
 it('rejects stale, future, impossible dates, invented places and unquoted evidence', () => {
  for (const date of ['2025-01-01','2027-01-01','2026-02-30','bad']) expect(evidenceGate(card,{...source,date},Date.parse('2026-09-12'))).toContain('missing_or_stale_source_date')
  expect(evidenceGate({...card,place:'Kathmandu',confirms:'a room reaches 39.8 degrees'},source,Date.parse('2026-09-12'))).toEqual(expect.arrayContaining(['quote_not_exact','local_place_not_grounded']))
 })
 it('rejects solved claims framed as unresolved problems and missing schema fields', () => {
  expect(evidenceGate({...card,status:'solved_elsewhere'},source,Date.parse('2026-09-12'))).toContain('solved_problem_requires_restaging')
  expect(draftSchema.safeParse({...card,impact:6}).success).toBe(false)
  expect(draftSchema.safeParse({...card,severity:undefined}).success).toBe(false)
 })
 it('grounds paraphrases with exact short excerpts without inventing or changing measurements', async () => {
  const paraphrased = {...card, confirms: 'lessons hit 39.8 degrees'}
  const grounded = groundQuote(paraphrased, source)
  expect(source.text).toContain(grounded.confirms)
  expect(grounded.confirms.split(/\s+/).length).toBeLessThanOrEqual(15)
  expect(evidenceGate(grounded,source,Date.parse('2026-09-12'))).toEqual([])
  expect(groundQuote({...paraphrased,headline:'This classroom reaches 99 degrees'},source).confirms).toBe(paraphrased.confirms)
  const ai = {run:vi.fn().mockResolvedValue({response: JSON.stringify({approved:false,reasons:['wrong physical subject'],headline_supported:false,body_supported:true,location_supported:true,impact_supported:true,status_supported:true,stage_supported:true})})} as unknown as Ai
  expect(await auditDraft(ai,source,grounded)).toContain('content_audit_failed')
 })
 it('prioritizes practical leads without dropping the other feed entries', () => {
  const entries = [{url:'https://nepalitimes.com/politics',title:'Parliament meets'}, {url:'https://nepalitimes.com/water',title:'This solar pump saves 30 farmers water'}]
  expect(prioritizeEntries(entries).map(e=>e.url)).toEqual([entries[1].url,entries[0].url])
  expect(entries[0].title).toBe('Parliament meets')
 })
 it('reads only configured publisher article links and deduplicates tracking URLs', () => {
  const xml = '<rss>' + ['https://nepalitimes.com/news/a?utm_source=x','https://nepalitimes.com/news/a','https://evil.example/news/b','https://nepalitimes.com/'].map(url=>`<item><link><![CDATA[${url}]]></link></item>`).join('') + '</rss>'
  expect(feedLinks(xml)).toEqual(['https://nepalitimes.com/news/a'])
 })
 it('blocks redirects off the allowlist before a second fetch', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}}))
  vi.stubGlobal('fetch',fetcher)
  await expect(fetchText(source.url)).rejects.toThrow('source_host_not_allowed')
  expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('bounds response bodies even without Content-Length', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('abcdef')))
  await expect(fetchText(source.url,new Set(['nepalitimes.com']),5)).rejects.toThrow('source_too_large')
 })
 it('requires every independent audit field even when approved is true', async () => {
  const verdict = {approved:true,reasons:[],headline_supported:true,body_supported:true,location_supported:true,impact_supported:false,status_supported:true,stage_supported:true}
  const ai = {run:vi.fn().mockResolvedValue({response:JSON.stringify(verdict)})} as unknown as Ai
  expect(await auditDraft(ai,source,card)).toContain('content_audit_failed')
  verdict.impact_supported=true
  vi.mocked(ai.run).mockResolvedValue({response:JSON.stringify(verdict)})
  expect(await auditDraft(ai,source,card)).toEqual([])
 })
 it('extracts publication metadata from an Article graph, ignoring unrelated schema dates', () => {
  const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'WebSite',datePublished:'2000-01-01'},{'@type':'NewsArticle',datePublished:'2026-09-12T09:00:00+05:30'}]})+'</script>'
  expect(articleDate(html)).toBe('2026-09-12')
 })
 it('keeps same-host slash redirects on HTTPS', async () => {
  const f=vi.fn().mockResolvedValueOnce(new Response(null,{status:301,headers:{location:'http://nepalitimes.com/news/classroom/'}})).mockResolvedValueOnce(new Response('article'))
  vi.stubGlobal('fetch',f)
  expect(await fetchText(source.url)).toBe('article')
  expect(String(f.mock.calls[1][0])).toBe('https://nepalitimes.com/news/classroom/')
 })
 it('resolves a city plus its enclosing district but rejects different towns or a national park', () => {
  const city = {name:'Jaipur',category:'place',type:'city',lat:'26.915',lon:'75.818'}
  const district = {name:'Jaipur',category:'boundary',type:'administrative',lat:'26.978',lon:'75.712',boundingbox:['26.4','27.5','74.9','76.2']}
  expect(chooseGeocode([city,district],'Jaipur')).toEqual({lat:26.915,lng:75.818})
  expect(()=>chooseGeocode([city,{...city,lat:'30'}],'Jaipur')).toThrow('ambiguous_geocode')
  expect(()=>chooseGeocode([city,{...district,type:'national_park'}],'Jaipur')).toThrow('ambiguous_geocode')
  expect(()=>chooseGeocode([city,{...district,boundingbox:['10','20','70','80']}],'Jaipur')).toThrow('ambiguous_geocode')
 })
 it('recognizes a spelled-out quantity while retaining the exact source quotation', () => {
  const s={...source,text:'In Nepalganj the classroom holds five pupils.'}
  expect(evidenceGate({...card,headline:'This classroom holds 5 pupils',confirms:'holds five pupils'},s,Date.parse('2026-09-12'))).toEqual([])
  expect(evidenceGate({...card,headline:'This classroom holds 6 pupils',confirms:'holds five pupils'},s,Date.parse('2026-09-12'))).toContain('measurement_not_quoted')
 })
 it('supports several headline measurements when the short quote backs one and the source backs all', () => {
  const s={...source,text:source.text+' The school has 25 pupils.'}
  expect(evidenceGate({...card,headline:'This classroom reaches 39.8 degrees for 25 pupils'},s,Date.parse('2026-09-12'))).toEqual([])
  expect(evidenceGate({...card,headline:'This classroom reaches 39.8 degrees for 99 pupils'},s,Date.parse('2026-09-12'))).toContain('measurement_not_quoted')
 })
 it('makes no network or AI calls when disabled or when the slot is already claimed', async () => {
  const ai = {run:vi.fn()}, fetcher = vi.fn()
  vi.stubGlobal('fetch',fetcher)
  const env = {DB:{},AI:ai,CACHE:{},MEDIA:{put:vi.fn().mockResolvedValue(null)},SCOUT_ENABLED:'false'} as unknown as Parameters<typeof runScout>[0]
  expect(await runScout(env,Date.now())).toEqual({status:'disabled'})
  env.SCOUT_ENABLED='true'
  expect(await runScout(env,Date.now())).toEqual({status:'already_ran_this_slot'})
  expect(ai.run).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
  expect(env.MEDIA!.put).toHaveBeenCalledWith(expect.stringMatching(/^scout-slots\/\d+$/),expect.any(String),expect.objectContaining({onlyIf:{etagDoesNotMatch:'*'}}))
 })
})
