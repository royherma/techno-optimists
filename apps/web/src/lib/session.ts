import type { Role } from '../../../../packages/types/index'

/** The signed-in person, as /api/auth/me returns them. */
export type Me = {
  id: string
  handle: string
  name: string
  avatar_url: string | null
  location: string | null
  skills: string[]
  roles: Role[]
  /**
   * The reader's own address. This is the ONE response that carries it, and it
   * goes only to the person it belongs to - see PublicPerson in
   * packages/types/index.ts. Never pass it into a component that renders
   * someone else's profile.
   */
  email: string | null
  /** Moderation powers. Never rely on this for access control - it is a hint
   *  for what to render, and the API re-checks on every write regardless. */
  is_admin: boolean
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
  const r = await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' })
  if (!r.ok) throw new Error('Sign out failed')
}
