import { useEffect, useState } from 'react'
import type { Challenge, FeedResponse } from '../../../../../packages/types'
export function useFeed(initial: Challenge[]) {
  const [challenges, setChallenges] = useState(initial)
  const [error, setError] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
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
        setChallenges(all); setError(false)
      } catch { if (!abort.signal.aborted) setError(true) }
    }
    void refresh()
    return () => abort.abort()
  }, [])
  return { challenges, error }
}
