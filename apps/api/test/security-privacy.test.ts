import { afterEach, beforeEach, expect, it } from 'vitest'
import { app } from '../src/index'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => f.sqlite.close())

it('does not publish the private profile name through AI attribution', async () => {
  f.sqlite.exec("INSERT INTO ai_runs(id,challenge_id,person_id,action,model,output) VALUES ('r1','c1','p1','draft','test-model','Public output')")
  const r = await app.request('/api/challenges/pond/ai/runs', {}, { DB: f.DB })
  const body = await r.json()
  expect(body.runs[0].by).toEqual({ handle: 'reader', avatar_url: null })
  expect(JSON.stringify(body)).not.toContain('Private Name')
})
