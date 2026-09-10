/**
 * Media upload to R2.
 *
 * The capture path is the product: someone points a phone at a real problem,
 * and thirty seconds later it is a Challenge. So this is deliberately boring -
 * one PUT with the bytes, one key back, no multi-step handshake to get wrong on
 * a bad rural connection.
 *
 * The Worker streams the body straight to R2 rather than issuing a presigned
 * URL: presigning needs an S3 credential pair on top of the binding we already
 * have, and Workers already stream without buffering the file in memory.
 */

/** What a phone camera actually produces, plus the formats we render. */
export const ALLOWED_TYPES: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/heic': { ext: 'heic', kind: 'image' },
  'image/heif': { ext: 'heif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
}

/** 100MB. A minute of phone video fits; a laptop dump does not. */
export const MAX_BYTES = 100 * 1024 * 1024

export type MediaCheck =
  | { ok: true; ext: string; kind: 'image' | 'video' }
  | { ok: false; error: string; status: 400 | 413 | 415 }

export const checkUpload = (contentType: string | undefined, length: number | null): MediaCheck => {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  const allowed = ALLOWED_TYPES[type]
  if (!allowed) return { ok: false, error: 'unsupported_type', status: 415 }
  if (length !== null && length > MAX_BYTES) return { ok: false, error: 'too_large', status: 413 }
  if (length === 0) return { ok: false, error: 'empty_body', status: 400 }
  return { ok: true, ext: allowed.ext, kind: allowed.kind }
}

/**
 * Object key. Namespaced by person so one account's uploads can be listed or
 * removed without scanning the bucket, and random so keys are unguessable.
 */
export const mediaKey = (personId: string, ext: string, rand: string) =>
  `u/${personId}/${Date.now().toString(36)}-${rand}.${ext}`

/** Public URL for a stored object. Served by this Worker, same origin. */
export const mediaUrl = (key: string) => `/media/${key}`
