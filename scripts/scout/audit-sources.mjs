#!/usr/bin/env node
// Read-only, dependency-free source audit. JSON or Markdown; no account credential.
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
const args = process.argv.slice(2)
const value = (name, fallback) => { const i=args.indexOf(name); return i<0 ? fallback : args[i+1] }
if(args.includes('--help')) {
 console.log('npm run scout:audit -- [--days 7|30|90] [--base URL] [--out outputs/scout-audit.md] [--json]')
 process.exit(0)
}
const days = Number(value('--days','30'))
if(![7,30,90].includes(days)) throw new Error('--days must be 7, 30 or 90')
const base = value('--base','https://technooptimists.org').replace(/\/$/,'')
const response=await fetch(`${base}/api/scout/sources?days=${days}`,{signal:AbortSignal.timeout(20000)})
if(!response.ok)throw new Error(`Source audit HTTP ${response.status}`)
const data=await response.json()
const cell=s=>String(s??'—').replaceAll('|','\\|').replaceAll('\n',' ')
const rate=n=>n===null?'—':`${(n*100).toFixed(1)}%`
const lines=[`# Scout source audit — ${days} days`, '', `Fetched ${new Date().toISOString()}. ${data.truncated?'WARNING: this window is truncated.':''}`, '',
 '| Source | Enabled | Runs | Checked | Approved | Published | Approval rate | Covers used | Generated | Feed errors | Model errors | Recommendation |',
 '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
 ...data.sources.map(s=>`| ${[s.name,s.enabled?'yes':'no',s.runs,s.counts.checked,s.counts.approved,s.counts.published,rate(s.approval_rate),s.counts.covers_used,s.counts.generated_used,s.counts.feed_errors,s.counts.model_errors,s.recommendation].map(cell).join(' | ')} |`), '',
 'Approval rate excludes articles whose model evaluation failed. Publication counts are outcomes, not human quality ratings. At least 20 evaluated articles and 5 runs are needed before replacement advice. Sources are never automatically retired.', '',
 ...data.sources.flatMap(s=>Object.keys(s.reasons).length?[`**${cell(s.name)} rejection reasons:** ${Object.entries(s.reasons).map(([k,n])=>`${cell(k)}: ${n}`).join(', ')}`,'']:[]),
 'Change `enabled` in `apps/api/src/scout-sources.ts` and deploy to pause/resume a source; preserve its ID and registry entry. Historical run records have no expiry.', '',
 `Full paginated history: ${base}/api/scout/source-runs`, '']
const output=args.includes('--json')?JSON.stringify(data,null,2)+'\n':lines.join('\n')
const out=value('--out',null)
if(out){await mkdir(dirname(out),{recursive:true});await writeFile(out,output);console.log(out)}else process.stdout.write(output)
