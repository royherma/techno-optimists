import { afterEach, describe, expect, it, vi } from 'vitest'
import { feedCover, fetchCover, resolveScoutImage } from '../src/scout-images'
import { SCOUT_FEEDS } from '../src/scout-sources'
import { feedEntries } from '../src/scout-cloudflare'
const feed=SCOUT_FEEDS.find(f=>f.id==='mongabay-india')!
function png(){const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);new DataView(bytes.buffer).setUint32(16,800);new DataView(bytes.buffer).setUint32(20,600);return bytes}
afterEach(()=>vi.unstubAllGlobals())
describe('publisher covers before generated illustrations',()=>{
 it('prefers feed media metadata and binds the cover to its own article',()=>{
  const xml='<item><link>https://india.mongabay.com/2026/story</link><media:content url="https://imgs.mongabay.com/cover.jpg?a=1&amp;b=2"/><description><![CDATA[<img src="https://imgs.mongabay.com/other.jpg">]]></description></item>'
  expect(feedCover(xml)).toBe('https://imgs.mongabay.com/cover.jpg?a=1&b=2')
  expect(feedEntries(xml,new Set(feed.hosts))).toEqual([{url:'https://india.mongabay.com/2026/story',image_url:'https://imgs.mongabay.com/cover.jpg?a=1&b=2'}])
 })
 it('stores a supplied cover with attribution and makes no AI call',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png())))
  const put=vi.fn(),bucket={head:vi.fn().mockResolvedValue(null),put} as unknown as R2Bucket
  const run=vi.fn(),ai={run} as unknown as Ai,onGenerate=vi.fn()
  const r=await resolveScoutImage(bucket,ai,feed,'scout-test',['https://imgs.mongabay.com/cover.png'],'classroom',onGenerate)
  expect(r).toMatchObject({generated:false,original_url:'https://imgs.mongabay.com/cover.png',w:800,h:600,credit:'Mongabay India'})
  expect(put.mock.calls[0][2].customMetadata.generated).toBe('false')
  expect(run).not.toHaveBeenCalled();expect(onGenerate).not.toHaveBeenCalled()
 })
 it('uses the article cover when the feed image is broken, without generating',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response(png())))
  const bucket={head:vi.fn().mockResolvedValue(null),put:vi.fn()} as unknown as R2Bucket
  const ai={run:vi.fn()} as unknown as Ai
  const r=await resolveScoutImage(bucket,ai,feed,'scout-test',['https://imgs.mongabay.com/broken.png','https://imgs.mongabay.com/article.png'],'subject',vi.fn())
  expect(r.generated).toBe(false);expect(r.failures).toEqual(['cover_http_404'])
  expect(ai.run).not.toHaveBeenCalled()
 })
 it('reuses a cached illustration only after supplied covers are unusable',async()=>{
  const bucket={head:vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({customMetadata:{w:'1024',h:'1024'}})} as unknown as R2Bucket
  const ai={run:vi.fn()} as unknown as Ai
  const r=await resolveScoutImage(bucket,ai,feed,'scout-test',['http://127.0.0.1/private'],'subject',vi.fn())
  expect(r.generated).toBe(true);expect(r.failures).toEqual(['cover_host_not_allowed']);expect(ai.run).not.toHaveBeenCalled()
 })
 it('blocks redirected private hosts before a second network request and rejects SVG',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}}));vi.stubGlobal('fetch',request)
  await expect(fetchCover('https://imgs.mongabay.com/cover.png',new Set(['imgs.mongabay.com']))).rejects.toThrow('cover_host_not_allowed')
  expect(request).toHaveBeenCalledTimes(1)
  request.mockResolvedValue(new Response('<svg onload="bad()"></svg>'))
  await expect(fetchCover('https://imgs.mongabay.com/cover.svg',new Set(['imgs.mongabay.com']))).rejects.toThrow('cover_not_usable_image')
 })
})
