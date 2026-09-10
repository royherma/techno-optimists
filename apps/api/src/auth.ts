import type { Context } from 'hono'
import type { Role } from '../../../packages/types/index'
import { isAdminEmail } from './admin'

/**
 * Email magic-link auth. No passwords, no OAuth provider.
 *
 * The rules that matter:
 *  - Tokens are random 32-byte values. Only their SHA-256 lands in the database,
 *    so a database read cannot be replayed as a login.
 *  - A person row is created on first successful click, never when the link is
 *    requested - otherwise anyone could fill the people table by typing emails.
 *  - Comparisons on secrets are constant-time.
 */

export const SESSION_COOKIE = 'to_session'
const SESSION_DAYS = 60
const LINK_MINUTES = 15

export type SessionPerson = {
  id: string
  handle: string
  name: string
  avatar_url: string | null
  location: string | null
  roles: Role[]
  is_admin: boolean
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** Opaque 32-byte token, URL-safe. This is the only form the user ever sees. */
export const mintToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer)

/** What we store. Never store the token itself. */
export const hashToken = async (token: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))

export const iso = (msFromNow: number) =>
  new Date(Date.now() + msFromNow).toISOString().replace('T', ' ').slice(0, 19)

export const linkExpiry = () => iso(LINK_MINUTES * 60_000)
export const sessionExpiry = () => iso(SESSION_DAYS * 86_400_000)

/**
 * Normalises an email for storage and lookup. Lowercase and trim only - we
 * deliberately do NOT strip gmail dots or +suffixes: those are different
 * addresses to some providers, and guessing wrong merges two people's accounts.
 */
export const normalizeEmail = (raw: string) => raw.trim().toLowerCase()

/** Local part of the email, reduced to something usable as a @handle. */
export const handleFromEmail = (email: string) => {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '')
  return base.slice(0, 20) || 'builder'
}

/** Title-cased fallback display name, used until the person sets their own. */
export const nameFromEmail = (email: string) => {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  return base.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Builder'
}

export const cookie = (token: string, secure: boolean) => {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86_400}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * A one-shot note to the next page load, read and erased by the browser.
 *
 * The session cookie is HttpOnly, so a page cannot tell "signed in just now"
 * from "signed in three weeks ago" - both are just a successful /api/auth/me.
 * The callback redirects to a bare path (no query string: `next` is the
 * reader's own and may already carry one), so this cookie is the only thing
 * that survives the redirect and says what happened.
 *
 * Deliberately NOT HttpOnly - the point is for client JS to read it. It carries
 * no authority: worst case a forged one shows a message that is already true
 * for anyone who could set it.
 */
export const SIGNAL_COOKIE = 'to_signal'

export const signalCookie = (signal: string, secure: boolean) => {
  const parts = [
    `${SIGNAL_COOKIE}=${signal}`,
    'Path=/',
    'SameSite=Lax',
    // Long enough to survive the redirect and a slow first paint, short enough
    // that a back-button visit an hour later does not re-announce sign-in.
    'Max-Age=30',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export const clearCookie = (secure: boolean) => {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export const readCookie = (header: string | undefined, name: string): string | null => {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

/**
 * Resolves the caller from their session cookie. Returns null for anonymous -
 * never throws, so read routes can call it unconditionally to personalise.
 */
export const currentPerson = async (
  c: Context<{ Bindings: { DB: D1Database } }>,
): Promise<SessionPerson | null> => {
  const token = readCookie(c.req.header('cookie'), SESSION_COOKIE)
  if (!token) return null
  const row = await c.env.DB.prepare(
    `SELECT p.id, p.handle, p.name, p.avatar_url, p.location, p.roles,
            i.email, i.is_admin
     FROM sessions s
     JOIN people p ON p.id = s.person_id
     LEFT JOIN identities i ON i.person_id = p.id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
  ).bind(await hashToken(token)).first()
  if (!row) return null
  let roles: Role[] = []
  try { roles = JSON.parse(String(row.roles ?? '[]')) as Role[] } catch { roles = [] }

  // ADMIN_EMAILS decides; is_admin caches. Reconcile here so editing that list
  // promotes or demotes accounts that already exist, on their next request.
  //
  // LEFT JOIN because a seeded person has no identity row - they have no email,
  // so they are not an admin, and that is the correct answer rather than a crash.
  //
  // The write only fires when the two actually disagree. currentPerson is on the
  // read path of every route; an unconditional UPDATE would make each page load
  // a database write for no reason.
  const email = row.email == null ? null : normalizeEmail(String(row.email))
  const shouldBeAdmin = email !== null && isAdminEmail(email)
  const cachedAdmin = Number(row.is_admin ?? 0) === 1
  if (email !== null && shouldBeAdmin !== cachedAdmin) {
    await c.env.DB.prepare('UPDATE identities SET is_admin = ? WHERE person_id = ?')
      .bind(shouldBeAdmin ? 1 : 0, String(row.id)).run()
  }

  return {
    id: String(row.id),
    handle: String(row.handle),
    name: String(row.name),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    location: row.location == null ? null : String(row.location),
    roles,
    is_admin: shouldBeAdmin,
  }
}
