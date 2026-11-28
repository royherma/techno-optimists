import type { MiddlewareHandler } from 'hono'

export class BodyTooLarge extends Error {}

export const readBoundedBody = async (body: ReadableStream<Uint8Array>, limit: number) => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new BodyTooLarge()
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export const limitRequestBody: MiddlewareHandler = async (c, next) => {
  const body = c.req.raw.body
  if (!body || c.req.path === '/api/uploads') return next()
  const limit = c.req.path === '/api/challenges/import' ? 4_000_000 : 128_000
  if (Number(c.req.header('content-length')) > limit) return c.json({ error: 'body_too_large' }, 413)
  try {
    const bytes = await readBoundedBody(body, limit)
    c.req.raw = new Request(c.req.raw, { body: bytes })
  } catch (error) {
    if (error instanceof BodyTooLarge) return c.json({ error: 'body_too_large' }, 413)
    throw error
  }
  await next()
}
