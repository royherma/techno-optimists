import { afterEach, beforeEach, expect, it } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => db.sqlite.close())

it('does not expose the email-derived private name in public AI attribution', async () => {
  db.sqlite.exec("INSERT INTO ai_runs(id,challenge_id,person_id,action,model,output) VALUES ('run','c1','p1','draft','test-model','Public draft')")
  const response = await app.request('/api/challenges/one/ai/runs', {}, { DB: db.DB })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.runs[0].by.handle).toBe('reader')
  expect(body.runs[0].output).toBe('Public draft')
  expect(JSON.stringify(body)).not.toContain('Private Reader')
  expect(body.runs[0].by).not.toHaveProperty('name')
})
