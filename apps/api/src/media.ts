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

/**
 * Intrinsic pixel size, read from the file's own header.
 *
 * The client measures its own uploads and sends the pair along, but a client
 * number is a claim, not a fact: it can be wrong, stale, or absent on a browser
 * that failed to decode. Reading the header here means the size stored beside
 * the object is the size the object actually has.
 *
 * Only the still formats are parsed. A video's dimensions live behind a real
 * container parse, which is not worth shipping into the upload path - a video
 * returns null and the surfaces fall back to their own default shape.
 */
export const dimensionsOf = (bytes: Uint8Array): { w: number; h: number } | null =>
  pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes)

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

/** PNG: an 8-byte signature then an IHDR chunk whose first two fields are the size. */
const pngSize = (b: Uint8Array) => {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  return { w: u32(b, 16), h: u32(b, 20) }
}

/**
 * JPEG: walk the marker segments to the frame header. The size lives in SOFn,
 * and n varies with the encoding - baseline, progressive and lossless all differ
 * - so every SOF marker counts except the four that are not frame headers.
 */
const jpegSize = (b: Uint8Array) => {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let o = 2
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue }
    const marker = b[o + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue }
    // DHT (c4), JPG (c8) and DAC (cc) sit in the SOF range but carry no frame.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: u16(b, o + 5), w: u16(b, o + 7) }
    }
    const len = u16(b, o + 2)
    if (len < 2) return null
    o += 2 + len
  }
  return null
}

/** WebP: a RIFF container with three variants, each storing the size differently. */
const webpSize = (b: Uint8Array) => {
  if (b.length < 30 || u32(b, 0) !== 0x52494646 || u32(b, 8) !== 0x57454250) return null
  const fourcc = u32(b, 12)
  // VP8 : a keyframe header, sizes are 14-bit at a fixed offset.
  if (fourcc === 0x56503820) return { w: u16le14(b, 26), h: u16le14(b, 28) }
  // VP8L: 14-bit width then height packed across the bits after the signature.
  if (fourcc === 0x5650384c) {
    const bits = u32le(b, 21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 }
  }
  // VP8X: an extended header storing both sizes minus one, 24-bit little-endian.
  if (fourcc === 0x56503858) {
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1
    return { w, h }
  }
  return null
}

const u16le14 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8)) & 0x3fff
