import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { securityDb } from './security-db'

let db: Awaited<ReturnType<typeof securityDb>>
beforeEach(async () => { db = await securityDb() })
afterEach(() => { db.sqlite.close(); vi.restoreAllMocks() })

it.each([
  ['/api/auth/request', 'POST'], ['/api/challenges', 'POST'],
  ['/api/challenges/one/updates', 'POST'], ['/api/people/me', 'PATCH'],
  ['/api/auth/signout', 'POST'], ['/api/ai/runs/run/published', 'POST'],
])('rejects oversized JSON before parsing at %s', async (path, method) => {
  const response = await app.request(path, {
    method, headers: { 'content-type': 'application/json', cookie: 'to_session=p1' },
    body: JSON.stringify({ body: 'x'.repeat(130_000) }),
  }, { DB: db.DB })
  expect(response.status).toBe(413)
})

it('stops reading an oversized upload before exhausting the stream', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let pulls = 0
  const cancel = vi.fn()
  const chunk = new Uint8Array(1024 * 1024)
  const body = new ReadableStream({
    pull(controller) {
      if (++pulls > 103) { controller.error(new Error('read past upload limit')); return }
      controller.enqueue(chunk)
    }, cancel,
  })
  const put = vi.fn()
  const multipart = { uploadPart: vi.fn(async (partNumber) => ({ partNumber, etag: 'test' })), complete: vi.fn(), abort: vi.fn(async () => {}) }
  const createMultipartUpload = vi.fn(async () => multipart)
  const response = await app.request('/api/uploads', {
    method: 'PUT', headers: { 'content-type': 'image/png', cookie: 'to_session=p1' }, body,
    duplex: 'half',
  } as RequestInit, { DB: db.DB, MEDIA: { put, createMultipartUpload } as unknown as R2Bucket })
  expect(response.status).toBe(413)
  expect(cancel).toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
  expect(multipart.complete).not.toHaveBeenCalled()
  expect(pulls).toBeLessThanOrEqual(102)
})
