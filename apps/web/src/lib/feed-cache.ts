import type { Challenge } from '../../../../packages/types'

const KEY = 'to:public-feed:v1'
const MAX_AGE = 5 * 60 * 1000

// Public browsing data only. Storage is optional, and every visit revalidates.
export function readFeedCache(): Challenge[] | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (!saved || typeof saved.at !== 'number' || saved.at > Date.now() || Date.now() - saved.at > MAX_AGE || !Array.isArray(saved.challenges)) return null
    if (!saved.challenges.every((c: Challenge) => c && typeof c.id === 'string' && typeof c.slug === 'string' && typeof c.title === 'string' && typeof c.summary === 'string' && Array.isArray(c.media) && c.actions && typeof c.type === 'string')) return null
    return saved.challenges
  } catch { return null }
}

export function writeFeedCache(challenges: Challenge[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), challenges })) }
  catch { /* Browsing still works when storage is blocked or full. */ }
}
