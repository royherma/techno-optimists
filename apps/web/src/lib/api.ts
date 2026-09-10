import type { ActionKind, Challenge, Update } from '../../../../packages/types/index'

// At build time Astro talks to the local wrangler dev API; in the browser the
// Worker serves both the assets and /api/* from one origin, so a relative path
// is correct there.
const BASE = import.meta.env.PUBLIC_API_BASE ?? 'http://127.0.0.1:8791'

export type DetailPerson = {
  id: string; handle: string; name: string; avatar_url: string | null
  location: string | null; skills: string[]; roles: string[]
  /** Every action this person has taken on the Challenge. */
  kinds: ActionKind[]
}

export async function getFeed(params = ''): Promise<{ challenges: Challenge[]; next_cursor: string | null }> {
  const r = await fetch(`${BASE}/api/challenges${params}`)
  if (!r.ok) throw new Error(`feed ${r.status}`)
  return r.json()
}

export async function getChallenge(slug: string): Promise<{
  challenge: Challenge; updates: Update[]; people: DetailPerson[]
}> {
  const r = await fetch(`${BASE}/api/challenges/${slug}`)
  if (!r.ok) throw new Error(`challenge ${slug}: ${r.status}`)
  return r.json()
}
