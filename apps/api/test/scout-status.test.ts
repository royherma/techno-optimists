import { expect, it } from 'vitest'
import { scoutRunStatus, SCOUT_STALE_MS } from '../src/scout-status'
it('shows stale work as interrupted without inventing completion or losing partial counts', () => {
 const now=Date.now(), started_at=new Date(now-SCOUT_STALE_MS-1).toISOString()
 const run={status:'running',started_at,created:1}
 expect(scoutRunStatus(run,now)).toMatchObject({status:'interrupted',created:1,counts_partial:true})
 expect(run.status).toBe('running')
 expect(scoutRunStatus({...run,updated_at:new Date(now).toISOString()},now)).toMatchObject({status:'running'})
 expect(scoutRunStatus({...run,status:'completed'},now)).toMatchObject({status:'completed'})
 expect(scoutRunStatus(null,now)).toBe(null)
})
