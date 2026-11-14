import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { MAX_BYTES } from '../src/media'
import { securityFixture } from './helpers/security'

let f: Awaited<ReturnType<typeof securityFixture>>
beforeEach(async () => { f = await securityFixture() })
afterEach(() => f.sqlite.close())

it.each(['/api/auth/request', '/api/challenges/pond/action', '/api/auth/signout'])('rejects oversized JSON before parsing it at %s', async (path) => {
  const r = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body: JSON.stringify({ junk: 'x'.repeat(130_000) }) }, { DB: f.DB })
  expect(r.status).toBe(413)
})

it('stops reading a streamed upload at its limit instead of buffering the entire request', async () => {
  let pulled = 0
  const cancel = vi.fn()
  const body = new ReadableStream({
    pull(controller) {
      if (++pulled > 110) { controller.close(); return }
      controller.enqueue(new Uint8Array(1024 * 1024))
    }, cancel,
  }, { highWaterMark: 0 })
  const multipart = { uploadPart: vi.fn(async (partNumber: number) => ({ partNumber, etag: 'test' })), abort: vi.fn(async () => {}), complete: vi.fn() }
  const bucket = { put: vi.fn(), createMultipartUpload: vi.fn(async () => multipart) }
  const r = await app.request('/api/uploads', {
    method: 'PUT', headers: { cookie: `to_session=${f.token}`, 'content-type': 'video/mp4' }, body, duplex: 'half',
  } as RequestInit, { DB: f.DB, MEDIA: bucket as unknown as R2Bucket })
  expect(r.status).toBe(413)
  expect(pulled).toBeLessThanOrEqual(MAX_BYTES / (1024 * 1024) + 1)
  expect(cancel).toHaveBeenCalled()
  expect(bucket.put).not.toHaveBeenCalled()
  expect(multipart.complete).not.toHaveBeenCalled()
})
