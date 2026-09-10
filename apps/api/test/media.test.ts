import { describe, expect, it } from 'vitest'
import { ALLOWED_TYPES, MAX_BYTES, checkUpload, mediaKey, mediaUrl } from '../src/media'

describe('checkUpload', () => {
  it('accepts what a phone camera produces', () => {
    for (const type of ['image/jpeg', 'image/heic', 'video/quicktime', 'video/mp4']) {
      expect(checkUpload(type, 1000).ok).toBe(true)
    }
  })

  it('tags images and videos with the right kind', () => {
    expect(checkUpload('image/jpeg', 10)).toMatchObject({ kind: 'image', ext: 'jpg' })
    expect(checkUpload('video/mp4', 10)).toMatchObject({ kind: 'video', ext: 'mp4' })
  })

  it('ignores charset parameters and casing on the content type', () => {
    expect(checkUpload('IMAGE/JPEG; charset=binary', 10).ok).toBe(true)
  })

  it('rejects anything not on the list', () => {
    expect(checkUpload('application/zip', 10)).toMatchObject({ ok: false, status: 415 })
    expect(checkUpload(undefined, 10)).toMatchObject({ ok: false, status: 415 })
  })

  it('rejects an oversize declared length', () => {
    expect(checkUpload('image/jpeg', MAX_BYTES + 1)).toMatchObject({ ok: false, status: 413 })
  })

  it('accepts exactly the cap', () => {
    expect(checkUpload('image/jpeg', MAX_BYTES).ok).toBe(true)
  })

  it('rejects an empty body', () => {
    expect(checkUpload('image/jpeg', 0)).toMatchObject({ ok: false, status: 400 })
  })

  it('allows an unknown length - the cap is re-checked after the write', () => {
    expect(checkUpload('image/jpeg', null).ok).toBe(true)
  })
})

describe('keys', () => {
  it('namespaces by person so one account can be listed or purged', () => {
    expect(mediaKey('p_abc', 'jpg', 'rand12')).toMatch(/^u\/p_abc\//)
  })

  it('never collides across calls', () => {
    const keys = new Set(Array.from({ length: 100 }, (_, i) => mediaKey('p_a', 'jpg', `r${i}`)))
    expect(keys.size).toBe(100)
  })

  it('keeps the extension', () => {
    expect(mediaKey('p_a', 'mov', 'r')).toMatch(/\.mov$/)
  })

  it('serves from the same origin, so no CORS and no base URL', () => {
    expect(mediaUrl('u/p_a/x.jpg')).toBe('/media/u/p_a/x.jpg')
  })
})

describe('ALLOWED_TYPES', () => {
  it('covers HEIC, which is the iPhone default', () => {
    expect(ALLOWED_TYPES['image/heic']).toBeDefined()
  })
})
