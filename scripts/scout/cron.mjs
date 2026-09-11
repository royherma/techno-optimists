#!/usr/bin/env node
import {parseArgs} from 'node:util'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {parse} from 'yaml'
import {atomicJSON,readState,enqueue,publishPending,requestAPI,createOnly,excludeSources} from './job.mjs'
import {sourceKey} from './auto.mjs'

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
process.chdir(repo)
const {values:o}=parseArgs({options:{write:{type:'boolean'},config:{type:'string',default:'scripts/scout/cron.yaml'},state:{type:'string',default:'outputs/scout-job'},'env-file':{type:'string'},help:{type:'boolean'}}})
if(o.help){console.log('npm run scout:cron -- [--write] [--config scripts/scout/cron.yaml] [--state outputs/scout-job] [--env-file .env]\nOne bounded run, no prompts. Dry run by default. --write appends eligible Challenges. Schedule this same command.');process.exit(0)}
if(o['env-file'])process.loadEnvFile(resolve(o['env-file']))
// The root entrypoint owns a process-scoped flock. Never substitute a stale
// PID file that a crashed cron run could leave behind.
if(!process.env.TECHNO_OPERATION_TOKEN)throw Error('Use npm run scout:cron so the shared operation lock covers this job')
const config=parse(await readFile(resolve(o.config),'utf8'))
const base=new URL(config.base)
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('remote API must use HTTPS')
const root=resolve(o.state)
await mkdir(root,{recursive:true})
const run=join(root,'runs',new Date().toISOString().replace(/[:.]/g,'-'))
await mkdir(run,{recursive:true})
const path=join(root,'state.json'), state=await readState(path)
const now=Date.now(),cookie=process.env.TO_SESSION
const report={started_at:new Date(now).toISOString(),dry_run:!o.write,run,created:0,skipped:0,failed:0}
const persist=async s=>{if(o.write)await atomicJSON(path,s)}
const command=(script,args=[],env={})=>new Promise((ok,no)=>{
  const child=spawn(process.execPath,[script,...args],{cwd:repo,env:{...process.env,...env},stdio:'inherit'})
  const timeout=setTimeout(()=>child.kill('SIGTERM'),(config.timeout_minutes??45)*60000)
  child.on('error',e=>{clearTimeout(timeout);no(e)})
  child.on('exit',(code,signal)=>{clearTimeout(timeout);code===0?ok():no(Error(`${script} exited ${code??signal}`))})
})
try{
  if(o.write){
    if(!cookie)throw Error('TO_SESSION is not configured for this job')
    const me=await requestAPI(base,'/api/auth/me',cookie)
    if(!me?.person?.is_admin)throw Error('Scout requires a valid admin session; no discovery or writes started')
  }
  const exclude=excludeSources(state)
  // Bootstrap dedupe from the real feed, so existing editorial Challenges are
  // not regenerated when the state directory is new or restored from backup.
  let offset=0
  for(let page=0;page<200;page++){
    const feed=await requestAPI(base,`/api/challenges?limit=50&offset=${offset}`)
    if(!Array.isArray(feed?.challenges))throw Error('invalid feed response')
    for(const c of feed.challenges)if(c.source?.url){try{exclude.push(sourceKey(c.source.url))}catch{/* Non-URL provenance is allowed on human-authored Challenges. */}}
    if(!feed.next_cursor)break
    offset=Number(feed.next_cursor)
    if(page===199)throw Error('feed exceeds Scout inventory limit; refusing incomplete dedupe')
  }
  await atomicJSON(join(run,'exclude.json'),exclude)
  const cfg={...config, sources:config.sources??[], max_queries:config.max_queries??4}
  await atomicJSON(join(run,'discovery.json'),cfg)
  await command('scripts/scout/scout.mjs',['--auto','--themes',join(run,'discovery.json'),'--out',run,'--cache',join(root,'cache'),'--exclude',join(run,'exclude.json'),'--query-offset',String(state.query_offset),'--limit',String(config.limit??12)])
  const completed=JSON.parse(await readFile(join(run,'run.json'),'utf8'))
  if(completed.complete!==true)throw Error('discovery did not finish')
  const cards=JSON.parse(await readFile(join(run,'cards.json'),'utf8'))
  const review=JSON.parse(await readFile(join(run,'review_queue.json'),'utf8'))
  const rejected=JSON.parse(await readFile(join(run,'rejected.json'),'utf8'))
  if(!completed.sources && !Object.keys(state.pending).length && !rejected.some(x=>x.reason==='already processed'))throw Error('no source pages fetched; inspect rejected.json for discovery errors')
  enqueue(state,cards)
  for(const c of cards)state.processed[sourceKey(c.source.url)]={retry_after:now+86400000,outcome:'queued'}
  for(const item of review)if(item.url)state.processed[sourceKey(item.url)]={retry_after:now+6*3600000,outcome:'review'}
  for(const item of rejected)if(item.url&&item.reason&&item.reason!=='already processed')state.processed[sourceKey(item.url)]={retry_after:now+7*86400000,outcome:'rejected'}
  state.query_offset+=(config.max_queries??4)
  await persist(state)
  report.eligible=cards.length;report.review=review.length;report.pending=Object.keys(state.pending).length
  if(o.write){
    const stats=await publishPending(state,{limit:config.publish_limit??5,persist,publish:async(row,item)=>{
      const plan=await createOnly(base,cookie,config.author??'atlas',row,true)
      if(plan.action==='skip')return plan
      if(config.images!==false){
        if(!item.media){
          const art=join(root,'art',row.slug);await mkdir(art,{recursive:true})
          const batch=join(art,'batch.json');await atomicJSON(batch,[row])
          await command('scripts/gen-challenge-art.mjs',[batch,'--write'],{SCOUT_ART_DIR:art})
          const generated=JSON.parse(await readFile(batch,'utf8'))[0]
          const bytes=await readFile(join(art,`${row.slug}.png`))
          const uploaded=await requestAPI(base,'/api/uploads',cookie,{method:'PUT',headers:{'content-type':'image/png'},body:bytes})
          if(!uploaded?.media?.url?.startsWith('/media/'))throw Error('upload returned no media URL')
          item.media={...generated.media[0],...uploaded.media,alt:`Illustration: ${row.image_subject}`.slice(0,300)}
          await persist(state)
        }
        const check=await fetch(new URL(item.media.url,base),{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(30000)})
        if(!check.ok)throw Error(`uploaded image unavailable: ${check.status}`)
        row.media=[item.media]
      }
      const result=await createOnly(base,cookie,config.author??'atlas',row,false)
      if(result.action==='create'){
        const saved=await requestAPI(base,`/api/challenges/${row.slug}`)
        if(!saved?.challenge||sourceKey(saved.challenge.source?.url)!==sourceKey(row.source_url))throw Error('post-write verification failed')
      }
      return result
    }})
    Object.assign(report,stats)
    if(stats.failed)process.exitCode=1
  }
  report.pending=Object.keys(state.pending).length
  report.finished_at=new Date().toISOString()
}catch(e){report.error=e.message;process.exitCode=1}
await atomicJSON(join(run,'summary.json'),report)
await atomicJSON(join(root,'last-run.json'),report)
console.log(JSON.stringify(report))
