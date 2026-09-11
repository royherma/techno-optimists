import {describe,it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {appendScoutRows,sourceIdentity,type ScoutRow} from '../src/scout-import'
import {app} from '../src/index'
import {hashToken} from '../src/auth'

const row:ScoutRow={slug:'scout-heat',type:'problem',stage:'ideas',title:'This classroom reaches 39.8 degrees',summary:'The roof traps heat during school hours.',media:[],tags:['heat'],source_url:'https://example.org/story/',created_at:'2026-09-01',impact:1}
function database(){
 const sql=new DatabaseSync(':memory:')
 sql.exec(readFileSync(new URL('../../../packages/db/schema.sql',import.meta.url),'utf8'))
 sql.exec("INSERT INTO people (id,handle,name) VALUES ('atlas','atlas','Atlas')")
 const prepare=(query:string)=>{
  let params: (string|number|null)[]=[]
  return {bind(...p:(string|number|null)[]){params=p;return this},async first(){return sql.prepare(query).get(...params)??null},execute(){return {meta:{changes:sql.prepare(query).run(...params).changes}}}}
 }
 const adapter={prepare,async batch(statements:ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}}
 return {sql,db:adapter as unknown as D1Database}
}
describe('append-only Scout import against SQLite',()=>{
 it('dry run writes nothing and retry preserves subsequent human edits',async()=>{
  const {sql,db}=database()
  try{
   expect((await appendScoutRows(db,'atlas',[row],true))[0].action).toBe('create')
   expect(sql.prepare('SELECT count(*) n FROM challenges').get()?.n).toBe(0)
   expect((await appendScoutRows(db,'atlas',[row],false))[0].action).toBe('create')
   sql.exec("UPDATE challenges SET title='Human correction',stage='test',media='[{\"url\":\"human.png\"}]'")
   expect((await appendScoutRows(db,'atlas',[{...row,title:'Model rewrite'}],false))[0].action).toBe('skip')
   expect(sql.prepare('SELECT title,stage,media FROM challenges').get()).toMatchObject({title:'Human correction',stage:'test',media:'[{"url":"human.png"}]'})
  }finally{sql.close()}
 })
 it('same source with another slug does not duplicate; tracking links normalize',async()=>{
  const {sql,db}=database();try{
   await appendScoutRows(db,'atlas',[row],false)
   expect((await appendScoutRows(db,'atlas',[{...row,slug:'changed',source_url:row.source_url+'?utm_source=newsletter'}],false))[0].action).toBe('skip')
   expect(sql.prepare('SELECT count(*) n FROM challenges').get()?.n).toBe(1)
  }finally{sql.close()}
 })
 it('concurrent plans still produce one row',async()=>{
  const {sql,db}=database();try{
   const results=await Promise.all([appendScoutRows(db,'atlas',[row],false),appendScoutRows(db,'atlas',[row],false)])
   expect(results.flat().map(x=>x.action).sort()).toEqual(['create','skip'])
   expect(sql.prepare('SELECT count(*) n FROM challenges').get()?.n).toBe(1)
  }finally{sql.close()}
 })
 it('invalid input and duplicate batch never partially write',async()=>{
  const {sql,db}=database();try{
   await expect(appendScoutRows(db,'atlas',[row,{...row,slug:'other'}],false)).rejects.toThrow('duplicate')
   expect(sql.prepare('SELECT count(*) n FROM challenges').get()?.n).toBe(0)
  }finally{sql.close()}
 })
 it('rejects credentials and non-http source URLs',()=>{
  expect(()=>sourceIdentity('file:///tmp/test')).toThrow()
  expect(()=>sourceIdentity('https://user:secret@example.org/story')).toThrow()
 })
 it('authenticated route confirms create-only mode and reports skip on retry',async()=>{
  const {sql,db}=database();try{
   const token='local-test-session'
   sql.prepare("INSERT INTO identities(person_id,email,is_admin) VALUES ('atlas','scout@example.org',1)").run()
   sql.prepare("INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?,'atlas','2099-01-01')").run(await hashToken(token))
   const request=()=>app.request('/api/challenges/import',{method:'POST',headers:{'content-type':'application/json',cookie:`to_session=${token}`},body:JSON.stringify({create_only:true,author:'atlas',dry_run:false,challenges:[row]})},{DB:db,ADMIN_EMAILS:'scout@example.org'})
   const first=await request();expect(first.status).toBe(201);expect(await first.json()).toMatchObject({create_only:true,dry_run:false,plan:[{action:'create'}]})
   expect(await (await request()).json()).toMatchObject({create_only:true,plan:[{action:'skip'}]})
  }finally{sql.close()}
 })
 it('create-only flag never bypasses authentication',async()=>{
  const {sql,db}=database();try{
   const r=await app.request('/api/challenges/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({create_only:true,author:'atlas',dry_run:false,challenges:[row]})},{DB:db})
   expect(r.status).toBe(401)
   expect(sql.prepare('SELECT count(*) n FROM challenges').get()?.n).toBe(0)
  }finally{sql.close()}
 })
})
