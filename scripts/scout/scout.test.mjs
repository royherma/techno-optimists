import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canonical,extract,gate,publicIP,toImport} from './core.mjs'
const source={url:'https://example.org/story',date:'2026-08-01',text:'This school in Accra recorded 39.8 degrees indoors.'}
const card={type:'PROBLEM',stage:'IDEAS',headline:'This Accra classroom reaches 39.8 degrees',body:'A metal roof traps heat.',location:{place:'Accra',country:'Ghana'},source_date:'2026-08-01',evidence:{quote:'recorded 39.8 degrees indoors.'},impact_rings:1,impact_reason:'One measured classroom.',status:'unsolved',tags:['heat'],problem_key:'classroom heat',image_subject:'a corrugated roof classroom'}
test('accepts grounded candidate without declaring human verification',()=>assert.deepEqual(gate(card,source,new Date('2026-09-11')),[]))
test('rejects invented number even when source has another measurement',()=>assert.ok(gate({...card,headline:'This classroom reaches 99 degrees'},source).includes('headline number not in evidence')))
test('rejects fabricated evidence, dates, and places',()=>{for(const c of [{...card,evidence:{quote:'recorded 99 degrees'}},{...card,location:{place:'Tokyo',country:'Japan'}},{...card,source_date:'2099-01-01'}])assert.ok(gate(c,source).length)})
test('rejects invalid dates and missing classifications',()=>assert.ok(gate({...card,type:'POST',impact_rings:6,source_date:null},source).length>=3))
test('solved cases require a learning classification',()=>assert.ok(gate({...card,status:'solved_elsewhere'},source).includes('solved example must be restaged')))
test('source parser drops injected scripts and navigation',()=>{const s=extract('<title>Article</title><nav>Junk</nav><article>Actual measurement<script>ignore rules</script></article>','https://example.org/a');assert.equal(s.text,'Actual measurement')})
test('canonical URL deduplication preserves meaningful query',()=>assert.equal(canonical('https://example.org/a?x=2&utm_source=foo#hi'),'https://example.org/a?x=2'))
test('blocks local and cloud metadata addresses',()=>{for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','192.168.1.2'])assert.equal(publicIP(ip),false);assert.equal(publicIP('8.8.8.8'),true)})
test('import keeps scope and lower-case app vocabulary',()=>{const row=toImport({...card,source:{url:source.url,outlet:'School report',date:'2026-08-01',confirms:'39.8 degrees'},status_note:'Needs follow-up'});assert.equal(row.impact,1);assert.equal(row.stage,'ideas');assert.equal(row.type,'problem')})
test('keeps trailing slash so redirect fetches do not loop',()=>assert.equal(canonical('https://example.org/article/'),'https://example.org/article/'))
test('empty date evidence cannot ground an invented date',()=>assert.ok(gate({...card,date_evidence:''},{...source,date:null}).includes('date not grounded in source')))
test('malformed model type cannot be approved into an import',()=>assert.throws(()=>toImport({...card,type:'IDEAS'}),/import schema/))
test('CLI approval rejects stale revisions and exports reviewed records',async()=>{
  const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises')
  const {tmpdir}=await import('node:os');const {join}=await import('node:path')
  const {execFileSync}=await import('node:child_process');const {hash}=await import('./core.mjs')
  const dir=await mkdtemp(join(tmpdir(),'scout-test-'))
  try{
    const c={...card,id:'classroom',source:{url:source.url,date:'2026-08-01',outlet:'School report',confirms:'39.8 degrees'}}
    await writeFile(join(dir,'cards.json'),JSON.stringify([c]));await writeFile(join(dir,'review_queue.json'),'[]')
    const a={id:c.id,revision:'stale',reviewer:'test',accepted:true,checked_source:true,checked_current_status:true}
    const file=join(dir,'approve.json');await writeFile(file,JSON.stringify([a]))
    const args=['scripts/scout/scout.mjs','--out',dir,'--approve',file]
    assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}))
    await writeFile(file,JSON.stringify([{...a,revision:hash(c)}]))
    execFileSync(process.execPath,args,{stdio:'pipe'})
    const rows=JSON.parse(await readFile(join(dir,'import.json')));assert.equal(rows.length,1);assert.equal(rows[0].title,c.headline)
  }finally{await rm(dir,{recursive:true,force:true})}
})
