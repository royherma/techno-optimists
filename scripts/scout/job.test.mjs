import {test} from 'node:test'
import assert from 'node:assert/strict'
import {enqueue,publishPending,excludeSources,createOnly,readState,atomicJSON} from './job.mjs'
import {autoGate,problemKey,stableSlug,rotatedQueries} from './auto.mjs'
const card={headline:'This Accra classroom reaches 39.8 degrees',body:'A metal roof traps heat.',type:'PROBLEM',stage:'IDEAS',location:{place:'Accra',country:'Ghana',lat:5.6,lng:-.2},source_date:'2026-09-01',impact_rings:1,impact_reason:'One classroom',tags:['heat'],problem_key:'classroom heat',source:{url:'https://example.org/article/',date:'2026-09-01',outlet:'School',confirms:'39.8 degrees'},confidence:'automated_checks_passed',image_subject:'A metal-roof classroom'}
const state=()=>({processed:{},pending:{},published:{},query_offset:0})
const verdict={approved:true,reasons:[],headline_supported:true,body_supported:true,location_supported:true,date_supported:true,impact_supported:true,status_supported:true,stage_supported:true}
test('auto gate fails closed on sensationalism, incomplete audits and stale dates',()=>{
 const now=Date.parse('2026-09-11');const source={date:'2026-09-01'}
 assert.deepEqual(autoGate(card,source,verdict,now),[])
 assert.ok(autoGate(card,source,{...verdict,body_supported:false},now).length)
 assert.ok(autoGate(card,source,{approved:true},now).length)
 assert.ok(autoGate({...card,source_date:'2020-01-01'},source,verdict,now).length)
 assert.ok(autoGate({...card,headline:'My classroom reaches 39.8 degrees'},source,verdict,now).length)
})
test('identity survives headline rewrites',()=>assert.equal(stableSlug(card),stableSlug({...card,headline:'New wording about the same classroom'})))
test('query batches rotate rather than repeating the first themes',()=>{const c={themes:['heat','water'],places:['Accra','Patna'],max_queries:2};assert.deepEqual(rotatedQueries(c,2),['Accra water','Patna water']);assert.deepEqual(rotatedQueries(c,4),rotatedQueries(c,0))})
test('only audited cards enter persistent publishing queue',()=>{const s=state();enqueue(s,[{...card,confidence:'needs_review'},card,card]);assert.equal(Object.keys(s.pending).length,1)})
test('lost success response retries safely, preserves queue and respects backoff',async()=>{
 const s=state();enqueue(s,[card]);let calls=0,writes=0,saves=0
 const publish=async()=>{calls++;if(calls===1){writes++;throw Error('connection dropped after commit')}return {action:'skip'}}
 const persist=async()=>saves++
 const a=await publishPending(s,{publish,persist,now:0});assert.equal(a.failed,1);assert.equal(Object.keys(s.pending).length,1)
 await publishPending(s,{publish,persist,now:1});assert.equal(calls,1)
 const b=await publishPending(s,{publish,persist,now:86400000});assert.equal(b.skipped,1);assert.equal(writes,1);assert.equal(Object.keys(s.pending).length,0);assert.equal(saves,2)
 enqueue(s,[card]);assert.equal(Object.keys(s.pending).length,0)
})
test('failed item does not block the next and capped batches leave work pending',async()=>{
 const s=state();enqueue(s,[card,{...card,problem_key:'different',source:{...card.source,url:'https://example.org/other'}}]);let n=0
 const result=await publishPending(s,{persist:async()=>{},publish:async()=>{if(!n++)throw Error('upload unavailable');return {action:'create'}}})
 assert.equal(result.created,1);assert.equal(result.failed,1);assert.equal(Object.keys(s.pending).length,1)
})
test('published URLs stay excluded while failed sources become eligible again',()=>{const s=state();s.processed={'https://example.org/a':{retry_after:null},'https://example.org/b':{retry_after:10}};assert.deepEqual(excludeSources(s,20),['https://example.org/a'])})
test('refuses legacy server responses rather than silently upserting',async()=>{
 const {createServer}=await import('node:http');const server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({dry_run:true,plan:[{action:'create'}]}))})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try{await assert.rejects(createOnly(`http://127.0.0.1:${server.address().port}`,'test','atlas',{},true),/create-only/)}finally{await new Promise(r=>server.close(r))}
})
test('state round trip persists pending work; corrupt state never resets silently',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path')
 const dir=await mkdtemp(join(tmpdir(),'scout-state-')),path=join(dir,'state.json')
 try{const s=await readState(path);enqueue(s,[card]);await atomicJSON(path,s);assert.equal(Object.keys((await readState(path)).pending).length,1);await writeFile(path,'broken');await assert.rejects(readState(path))}finally{await rm(dir,{recursive:true})}
})
