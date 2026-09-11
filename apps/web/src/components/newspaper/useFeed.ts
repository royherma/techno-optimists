import { useEffect, useState } from 'react'
import { readFeedCache, writeFeedCache } from '../../lib/feed-cache'
import type { Challenge, FeedResponse } from '../../../../../packages/types'
export function useFeed(initial: Challenge[]) {
  const [challenges, setChallenges] = useState(initial)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    const cached = readFeedCache()
    if (cached) { setChallenges(cached); setLoading(false) }
    // A failed connection must release the skeleton and expose the build snapshot.
    const timeout = window.setTimeout(() => abort.abort(), 8000)
    let disposed = false
    async function refresh() {
      try {
        let cursor: string | null = null
        const all: Challenge[] = []
        do {
          const response: Response = await fetch('/api/challenges?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { signal: abort.signal })
          if (!response.ok) throw new Error('feed')
          const data: FeedResponse = await response.json()
          all.push(...data.challenges); cursor = data.next_cursor
        } while (cursor)
        if (!disposed) { setChallenges(all); setError(false); writeFeedCache(all) }
      } catch { if (!disposed) setError(true) }
      finally { window.clearTimeout(timeout); if (!disposed) setLoading(false) }
    }
    void refresh()
    return () => { disposed = true; window.clearTimeout(timeout); abort.abort() }
  }, [])
  return { challenges, error, loading }
}
