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

/**
 * The site-wide visit total, baked into the footer at build time so the hit
 * counter opens on the last known figure instead of six zeros.
 *
 * Never throws. Every other call here failing should fail the build - a feed
 * that 500s must not ship as an empty index - but a counter is decoration on
 * top of the page, and a build that dies because a cosmetic number was
 * unavailable is the wrong trade. An API without the route yet, or without the
 * table, returns 0 and the island corrects it on first load.
 */
export async function getSiteViews(): Promise<number> {
  try {
    const r = await fetch(`${BASE}/api/site/views`)
    if (!r.ok) return 0
    const { views } = await r.json() as { views?: number }
    return typeof views === 'number' ? views : 0
  } catch {
    return 0
  }
}

export async function getChallenge(slug: string): Promise<{
  challenge: Challenge; updates: Update[]; people: DetailPerson[]
}> {
  const r = await fetch(`${BASE}/api/challenges/${slug}`)
  if (!r.ok) throw new Error(`thread ${slug}: ${r.status}`)
  return r.json()
}
