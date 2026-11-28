import { expect, it, vi } from 'vitest'
import { dimensionsOf, MAX_BYTES, storeUpload } from '../src/media'
import { BodyTooLarge } from '../src/request-body'

const PART = 5 * 1024 * 1024
const stream = (...chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() },
})
const storage = () => {
  const saved: Uint8Array[] = []
  const multipart = {
    uploadPart: vi.fn(async (partNumber: number, bytes: Uint8Array) => {
      saved.push(bytes.slice())
      return { partNumber, etag: `part-${partNumber}` }
    }),
    complete: vi.fn(async () => ({})), abort: vi.fn(async () => {}),
  }
  const bucket = {
    put: vi.fn(async (_key, bytes: Uint8Array) => { saved.push(bytes.slice()); return {} }),
    createMultipartUpload: vi.fn(async () => multipart),
  }
  return { bucket: bucket as unknown as R2Bucket, mocks: bucket, multipart, saved }
}
const metadata = { httpMetadata: { contentType: 'image/png' }, customMetadata: { person_id: 'test-person' } }

it('stores small uploads once with metadata and measured dimensions', async () => {
  const f = storage()
  const png = new Uint8Array(30)
  png.set([0x89, 0x50, 0x4e, 0x47])
  new DataView(png.buffer).setUint32(16, 640)
  new DataView(png.buffer).setUint32(20, 480)
  const result = await storeUpload(f.bucket, 'test.png', stream(png.subarray(0, 10), png.subarray(10)), metadata)
  expect(result).toEqual({ bytes: 30, size: { w: 640, h: 480 } })
  expect(f.mocks.put).toHaveBeenCalledWith('test.png', png, metadata)
  expect(f.mocks.createMultipartUpload).not.toHaveBeenCalled()
})

it.each([PART, PART + 1, PART * 2 + 23])('preserves every byte and ordered etag at multipart size %i', async length => {
  const f = storage()
  const input = Uint8Array.from({ length }, (_, i) => i % 251)
  const result = await storeUpload(f.bucket, 'video.mp4', stream(input.subarray(0, 123), input.subarray(123, PART + 7), input.subarray(PART + 7)), metadata)
  expect(result.bytes).toBe(length)
  expect(f.mocks.put).not.toHaveBeenCalled()
  expect(f.mocks.createMultipartUpload).toHaveBeenCalledWith('video.mp4', metadata)
  const combined = Buffer.concat(f.saved)
  expect(combined.equals(Buffer.from(input))).toBe(true)
  const parts = f.saved.map((_, i) => ({ partNumber: i + 1, etag: `part-${i + 1}` }))
  expect(f.multipart.complete).toHaveBeenCalledWith(parts)
  expect(f.saved.slice(0, -1).every(bytes => bytes.length === PART)).toBe(true)
  expect(f.multipart.abort).not.toHaveBeenCalled()
})

it('accepts exactly the maximum without keeping the whole file in memory', async () => {
  let parts = 0
  const multipart = {
    uploadPart: vi.fn(async (partNumber: number, bytes: Uint8Array) => {
      expect(bytes.length).toBe(PART)
      return { partNumber, etag: String(partNumber) }
    }),
    complete: vi.fn(async () => ({})), abort: vi.fn(),
  }
  const bucket = { createMultipartUpload: async () => multipart } as unknown as R2Bucket
  const input = new ReadableStream<Uint8Array>({ pull(controller) {
    if (parts++ === MAX_BYTES / PART) controller.close()
    else controller.enqueue(new Uint8Array(PART))
  } }, { highWaterMark: 0 })
  expect((await storeUpload(bucket, 'video.mp4', input, metadata)).bytes).toBe(MAX_BYTES)
  expect(multipart.uploadPart).toHaveBeenCalledTimes(20)
  expect(multipart.complete).toHaveBeenCalledTimes(1)
})

it('cancels and aborts oversized streams without publishing their partial object', async () => {
  const f = storage()
  const cancel = vi.fn()
  let sent = 0
  const input = new ReadableStream<Uint8Array>({ pull(controller) {
    controller.enqueue(new Uint8Array(++sent <= 20 ? PART : 1))
  }, cancel }, { highWaterMark: 0 })
  await expect(storeUpload(f.bucket, 'video.mp4', input, metadata)).rejects.toBeInstanceOf(BodyTooLarge)
  expect(f.multipart.abort).toHaveBeenCalledTimes(1)
  expect(f.multipart.complete).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalledTimes(1)
})

it.each(['uploadPart', 'complete'] as const)('aborts failed %s operations and preserves the original error', async operation => {
  const f = storage()
  f.multipart[operation].mockRejectedValueOnce(new Error('storage failure'))
  await expect(storeUpload(f.bucket, 'video.mp4', stream(new Uint8Array(PART)), metadata)).rejects.toThrow('storage failure')
  expect(f.multipart.abort).toHaveBeenCalledTimes(1)
})

it('does not write an empty upload', async () => {
  const f = storage()
  expect(await storeUpload(f.bucket, 'empty', stream(), metadata)).toEqual({ bytes: 0, size: null })
  expect(f.mocks.put).not.toHaveBeenCalled()
  expect(f.mocks.createMultipartUpload).not.toHaveBeenCalled()
})

it('returns no dimensions for malformed or unsupported content', () => {
  expect(dimensionsOf(new Uint8Array())).toBeNull()
  expect(dimensionsOf(new Uint8Array(60))).toBeNull()
  expect(dimensionsOf(new Uint8Array([0xff, 0xd8, 0xff, 0xc0]))).toBeNull()
})
