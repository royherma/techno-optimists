import {readFile,writeFile,rename} from 'node:fs/promises'
import {sourceKey,problemKey,stableSlug} from './auto.mjs'
import {toImport} from './core.mjs'

export async function readState(path) {
  try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;return {version:1,query_offset:0,processed:{},pending:{},published:{}}}
}
export async function atomicJSON(path,value) {
  await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n')
  await rename(path+'.tmp',path)
}
export function enqueue(state,cards) {
  for(const card of cards){
    if(card.confidence!=='automated_checks_passed')continue
    const key=problemKey(card)
    if(!state.published[key] && !state.pending[key]) state.pending[key]={card,attempts:0,next_retry:0}
  }
}
export async function publishPending(state,{publish,persist,now=Date.now(),limit=10}) {
  const stats={created:0,skipped:0,failed:0}
  for(const [key,item] of Object.entries(state.pending).filter(([,x])=>x.next_retry<=now).slice(0,limit)){
    try{
      const row={...toImport(item.card),slug:stableSlug(item.card)}
      row.source_note=`Automated Scout; reported as of ${item.card.source.date}. ${row.source_note} | Severity: ${item.card.severity??'unspecified'}`.slice(0,2000)
      // A retry uses the same slug and a create-only server transaction. A
      // dropped response after a successful write will resolve to skip.
      const result=await publish(row,item)
      if(!['create','skip'].includes(result.action))throw Error('unexpected import action')
      state.published[key]={slug:row.slug,url:item.card.source.url,at:new Date(now).toISOString()}
      state.processed[sourceKey(item.card.source.url)]={retry_after:null,outcome:'published'}
      delete state.pending[key]
      stats[result.action==='create'?'created':'skipped']++
    }catch(e){
      item.attempts++;item.error=e.message
      item.next_retry=now+Math.min(24*3600000,60000*2**Math.min(item.attempts,10))
      stats.failed++
    }
    await persist(state)
  }
  return stats
}
export async function requestAPI(base,path,cookie,{method='GET',body,headers={}}={}) {
  const response=await fetch(new URL(path,base),{method,redirect:'error',headers:{...headers,...(cookie?{cookie:`to_session=${cookie}`}:{})},body,signal:AbortSignal.timeout(30000)})
  const data=await response.json().catch(()=>null)
  if(!response.ok)throw Error(`API ${response.status}: ${data?.error??'request failed'}`)
  return data
}
export async function createOnly(base,cookie,author,row,dryRun) {
  const data=await requestAPI(base,'/api/challenges/import',cookie,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({author,create_only:true,dry_run:dryRun,challenges:[row]})})
  if(data?.create_only!==true || data?.dry_run!==dryRun || !Array.isArray(data.plan) || data.plan.length!==1 || !['create','skip'].includes(data.plan[0].action))throw Error('server does not confirm create-only imports; deploy the Scout API before running the job')
  return data.plan[0]
}
export function excludeSources(state,now=Date.now()) {
  return [...Object.entries(state.processed).filter(([,v])=>v.retry_after===null||v.retry_after>now).map(([url])=>url),...Object.values(state.pending).map(x=>sourceKey(x.card.source.url))]
}
