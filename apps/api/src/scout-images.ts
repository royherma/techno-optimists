import { dimensionsOf } from './media'
import type { ScoutFeed } from './scout-sources'

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
export function feedCover(item: string): string | undefined {
  const explicit = item.match(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["']/i)?.[1]
    ?? item.match(/<enclosure\b(?=[^>]*type=["']image\/)[^>]*\burl=["']([^"']+)["']/i)?.[1]
  const inline = item.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
  return explicit || inline ? decode((explicit ?? inline)!) : undefined
}
export function imageHosts(feed: ScoutFeed): Set<string> {
  return new Set([...feed.hosts, ...feed.image_hosts])
}
export async function fetchCover(raw: string, hosts: Set<string>) {
  let url = raw
  for (let i = 0; i < 4; i++) {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.port || u.username || u.password || !hosts.has(u.hostname)) throw new Error('cover_host_not_allowed')
    const response = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'TechnoOptimistsScout/1.0 (+https://technooptimists.org)' } })
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const next = response.headers.get('location')
      if (!next) throw new Error('cover_redirect_missing')
      url = new URL(next, u).href; continue
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`cover_http_${response.status}`) }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const {done, value} = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 6_000_000) throw new Error('cover_too_large')
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const dimensions = dimensionsOf(bytes)
    const contentType = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png'
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : null
    if (!contentType || !dimensions || dimensions.w < 200 || dimensions.h < 150 || dimensions.w * dimensions.h > 25_000_000) throw new Error('cover_not_usable_image')
    return { bytes, contentType, ...dimensions, original_url: raw }
  }
  throw new Error('cover_redirect_limit')
}
export type ScoutImage = { key: string; w: number; h: number; generated: boolean; original_url?: string; credit: string; failures: string[] }
export async function resolveScoutImage(bucket: R2Bucket, ai: Ai, feed: ScoutFeed, slug: string, covers: string[], subject: string, onGenerate: () => void): Promise<ScoutImage> {
  const coverKey = `scout/${slug}/cover`, generatedKey = `scout/${slug}.jpg`
  const failures: string[] = []
  const saved = await bucket.head(coverKey)
  if (saved?.customMetadata?.original_url && Number(saved.customMetadata.w) && Number(saved.customMetadata.h)) return {
    key: coverKey, w: Number(saved.customMetadata.w), h: Number(saved.customMetadata.h), generated: false,
    original_url: saved.customMetadata.original_url, credit: saved.customMetadata.credit ?? feed.name, failures,
  }
  for (const url of [...new Set(covers)].slice(0, 2)) {
    try {
      const cover = await fetchCover(url, imageHosts(feed))
      await bucket.put(coverKey, cover.bytes, { httpMetadata: { contentType: cover.contentType }, customMetadata: { w: String(cover.w), h: String(cover.h), original_url: url, credit: feed.name, generated: 'false' } })
      return { key: coverKey, w: cover.w, h: cover.h, original_url: url, credit: feed.name, generated: false, failures }
    } catch (error) { failures.push(error instanceof Error ? error.message : 'cover_fetch_failed') }
  }
  const existing = await bucket.head(generatedKey)
  if (existing && Number(existing.customMetadata?.w) && Number(existing.customMetadata?.h)) return {
    key: generatedKey, w: Number(existing.customMetadata!.w), h: Number(existing.customMetadata!.h), generated: true, credit: 'Generated illustration', failures,
  }
  onGenerate()
  const result = await ai.run('@cf/black-forest-labs/flux-1-schnell', { prompt: `Flat vector editorial illustration, muted sage, sand, terracotta, slate blue. No text, no faces. Simple geometry, soft grain. Subject: ${subject}`, steps: 4 })
  if (!result.image || result.image.length > 8_000_000) throw new Error('image_missing_or_too_large')
  const bytes = Uint8Array.from(atob(result.image), c => c.charCodeAt(0)), dimensions = dimensionsOf(bytes)
  if (!dimensions || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('invalid_generated_jpeg')
  await bucket.put(generatedKey, bytes, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { w: String(dimensions.w), h: String(dimensions.h), generated: 'true', license: 'generated', model: 'flux-1-schnell' } })
  return { key: generatedKey, ...dimensions, generated: true, credit: 'Generated illustration', failures }
}
