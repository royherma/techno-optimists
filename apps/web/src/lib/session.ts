import type { Role } from '../../../../packages/types/index'

/** The signed-in person, as /api/auth/me returns them. */
export type Me = {
  id: string
  handle: string
  name: string
  avatar_url: string | null
  location: string | null
  roles: Role[]
}

/**
 * The session lives in an httpOnly cookie, so the page cannot read it directly
 * and must ask the API. Static pages are shared by every reader, which means
 * this always runs in the browser after load - never at build time.
 */
export async function getMe(): Promise<Me | null> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!r.ok) return null
    return (await r.json()).person ?? null
  } catch {
    return null
  }
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' })
}
