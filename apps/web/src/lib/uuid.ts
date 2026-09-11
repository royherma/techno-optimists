/**
 * A v4 UUID that also works over plain http.
 *
 * Why this exists: `crypto.randomUUID` is gated to secure contexts, so on
 * http://technooptimists.org it is undefined and calling it throws
 * "crypto.randomUUID is not a function" - which killed the whole Discussion
 * island on mount, taking the comment form with it. localhost is a secure
 * context by definition, so dev never saw it, and every test builds its
 * request_id in Node where randomUUID exists unconditionally.
 *
 * The fallback is NOT Math.random. The server validates request_id as
 * z.string().uuid() and uses it as the idempotency key that stops a retry
 * publishing the same response twice (apps/api/src/community.ts:27,89) - so
 * the value has to be a syntactically valid v4, and two drafts colliding
 * would merge two different people's comments. getRandomValues is the one
 * member of Crypto that insecure contexts keep, so the entropy is the same
 * CSPRNG either way; only the formatting is ours.
 */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  // Version 4 in the high nibble of byte 6, RFC 4122 variant in byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
