/**
 * Slugs are the public URL of a Challenge and never change, so they are derived
 * from the title once at creation and then left alone.
 */

const STOP = new Set(['a', 'an', 'the', 'this', 'that', 'is', 'are', 'of', 'to', 'in', 'on', 'for', 'my', 'his', 'her', 'their'])

/**
 * "This farmer loses a third of his milk" -> "farmer-loses-third-milk".
 * Stop words go because a URL reads better without them, but only when enough
 * words survive - "how to fix the a" must not slug to nothing.
 */
export const slugify = (title: string, maxWords = 6) => {
  const words = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)

  // Stop words only go if enough meaning survives without them. "Is it the one?"
  // reduces to "it-one", which names nothing - keep the original title instead.
  const meaty = words.filter((w) => !STOP.has(w))
  const keepAll = meaty.length < 3 || meaty.join('').length < 8
  const chosen = (keepAll ? words : meaty).slice(0, maxWords)
  return chosen.join('-').slice(0, 80).replace(/^-+|-+$/g, '') || 'challenge'
}
