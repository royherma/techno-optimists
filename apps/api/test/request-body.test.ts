import { expect, it, vi } from 'vitest'
import { BodyTooLarge, readBoundedBody } from '../src/request-body'
import { app } from '../src/index'

const stream = (...chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() },
})

it('reassembles split multibyte text without corrupting it', async () => {
  const bytes = new TextEncoder().encode('🌱 water')
  const result = await readBoundedBody(stream(bytes.subarray(0, 2), bytes.subarray(2, 5), bytes.subarray(5)), bytes.length)
  expect(new TextDecoder().decode(result)).toBe('🌱 water')
})

it('accepts an empty body and exactly the limit', async () => {
  expect(await readBoundedBody(stream(), 4)).toEqual(new Uint8Array())
  expect(await readBoundedBody(stream(new Uint8Array([1, 2]), new Uint8Array([3, 4])), 4)).toEqual(new Uint8Array([1, 2, 3, 4]))
})

it('cancels at the first excess byte and releases the stream lock', async () => {
  const cancel = vi.fn()
  let reads = 0
  const input = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(2)) }, cancel }, { highWaterMark: 0 })
  await expect(readBoundedBody(input, 4)).rejects.toBeInstanceOf(BodyTooLarge)
  expect(reads).toBe(3)
  expect(cancel).toHaveBeenCalledOnce()
  expect(input.locked).toBe(false)
})

it('preserves stream failures and releases the reader', async () => {
  const input = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('disconnected')) } })
  await expect(readBoundedBody(input, 4)).rejects.toThrow('disconnected')
  expect(input.locked).toBe(false)
})

it('refuses oversized declared lengths without touching the database', async () => {
  const prepare = vi.fn(() => { throw new Error('must not query') })
  const r = await app.request('/api/auth/request', { method: 'POST', headers: { 'content-length': '5000000' }, body: '{}' }, { DB: { prepare } as unknown as D1Database })
  expect(r.status).toBe(413)
  expect(prepare).not.toHaveBeenCalled()
})

it('does not treat Content-Length as proof that a streamed body is small', async () => {
  let reads = 0
  const input = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(64_000)) } }, { highWaterMark: 0 })
  const r = await app.request('/api/auth/signout', { method: 'POST', headers: { 'content-length': '1' }, body: input, duplex: 'half' } as RequestInit, { DB: {} as D1Database })
  expect(r.status).toBe(413)
  expect(reads).toBe(3)
})
