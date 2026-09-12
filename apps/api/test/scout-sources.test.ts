import { describe, it, expect, vi } from 'vitest'
import { app } from '../src/index'
import { SCOUT_FEEDS, sourceRun, runKey, saveSourceRun, sourceRunPage, summarizeSources, selectSource, recordReasons, wilsonLower } from '../src/scout-sources'
const now = Date.parse('2026-09-12T06:00:00Z')
const feeds = SCOUT_FEEDS.slice(0, 3)
function sample(id: number, age = 0) {
  const r = sourceRun(feeds[id], 100 - age, now - age * 6 * 3600_000, 'test')
  r.counts.checked = 2; r.counts.readable = 2
  return r
}
describe('source history and adaptive rotation', () => {
  it('stable per-source slot keys prevent retry double counting and have no expiry', async () => {
    const entries = new Map<string, {value:string;metadata:unknown}>()
    const put = vi.fn(async (key,value,options) => { entries.set(key,{value,metadata:options.metadata}) })
    const cache = {put,list:async()=>({keys:[...entries].map(([name,v])=>({name,metadata:v.metadata})),list_complete:true})} as unknown as KVNamespace
    const r = sample(0);r.counts.published=1;r.counts.approved=1
    await saveSourceRun(cache,r);await saveSourceRun(cache,r)
    expect(entries.size).toBe(1)
    expect(put.mock.calls[0][2]).not.toHaveProperty('expirationTtl')
    const page = await sourceRunPage(cache)
    expect(summarizeSources(feeds,page.runs,now).find(s=>s.id===feeds[0].id)?.counts.published).toBe(1)
    expect(runKey({...r,slot:101}) < runKey(r)).toBe(true)
  })
  it('paused and removed sources retain report history but are not selected', () => {
    const r = sample(0)
    const paused = [{...feeds[0],enabled:false},feeds[1]]
    expect(summarizeSources(paused,[r],now).find(s=>s.id===feeds[0].id)?.runs).toBe(1)
    expect(selectSource(paused,[r],3,now)?.feed.id).toBe(feeds[1].id)
    expect(summarizeSources([feeds[1]],[r],now).find(s=>s.id===feeds[0].id)?.enabled).toBe(false)
  })
  it('collects evidence before replacement advice and excludes model failures from evaluated sample', () => {
    const small = [sample(0)];small[0].counts.model_errors=1
    expect(summarizeSources(feeds,small,now).find(s=>s.id===feeds[0].id)).toMatchObject({evaluated:1,enough_data:false,recommendation:'collect_more_data'})
    const enough = Array.from({length:10},(_,i)=>sample(0,i))
    expect(summarizeSources(feeds,enough,now).find(s=>s.id===feeds[0].id)?.recommendation).toBe('review_for_replacement')
  })
  it('reserves exploration turns for unsampled sources even with a proven winner', () => {
    const runs = Array.from({length:10},(_,i)=>{const r=sample(0,i);r.counts.approved=2;r.counts.published=2;return r})
    expect(selectSource(feeds,runs,3,now)?.feed.id).toBe(feeds[0].id)
    expect(selectSource(feeds,runs,4,now)?.feed.id).not.toBe(feeds[0].id)
    expect(wilsonLower(20,20)).toBeGreaterThan(wilsonLower(1,1))
  })
  it('three consecutive feed errors cool down; model failures do not', () => {
    const errors = [0,1,2].map(age=>{const r=sample(0,age);r.counts.feed_errors=1;return r})
    expect(selectSource([feeds[0]],errors,3,now)).toBeNull()
    expect(selectSource([feeds[0]],errors,3,now+73*3600_000)?.feed.id).toBe(feeds[0].id)
    for(const r of errors){r.counts.feed_errors=0;r.counts.model_errors=1}
    expect(selectSource([feeds[0]],errors,3,now)).not.toBeNull()
  })
  it('stabilizes reason categories instead of creating a metric per model sentence', () => {
    const r=sample(0)
    recordReasons(r,['quote_not_exact','quote_not_exact','invented explanation one','invented explanation two'])
    expect(r.reasons).toEqual({quote_not_exact:1,other_evidence_failure:1})
  })
  it('audit route validates windows and lists new sources with no invented metrics', async () => {
    const response=await app.request('/api/scout/sources?days=30',{}, {DB:{} as D1Database})
    const data=await response.json()
    expect(data.sources).toHaveLength(8)
    expect(data.sources.every((s:{runs:number;approval_rate:null})=>s.runs===0&&s.approval_rate===null)).toBe(true)
    expect((await app.request('/api/scout/sources?days=999',{}, {DB:{} as D1Database})).status).toBe(400)
  })
})
