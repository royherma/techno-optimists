/**
 * Who is an admin, hardcoded.
 *
 * This is a list in source on purpose, and it is temporary. It is not a secret:
 * it grants nothing by itself, it only names addresses that already have to pass
 * the magic-link flow to prove they own the mailbox. A leaked copy of this file
 * lets nobody in.
 *
 * It is deliberately NOT a wrangler var or a secret - both put a deploy between
 * Roy and a one-line change, for a list that exists until real roles land.
 *
 * The rule: this list decides, `identities.is_admin` caches. Every session
 * resolve rewrites the column to agree with this array, so adding an address
 * promotes an existing account on its next request, and removing one demotes it.
 * There is no third place to check and no way for the two to drift apart.
 */

/** Compared against the normalized (lowercased, trimmed) email. */
export const ADMIN_EMAILS: readonly string[] = [
  'royherma@gmail.com',
  'techguyver1337@gmail.com',
]

/**
 * Takes an already-normalized email. Callers must pass the output of
 * normalizeEmail(), never a raw address - otherwise 'Roy@Gmail.com ' misses.
 */
export const isAdminEmail = (normalizedEmail: string): boolean =>
  ADMIN_EMAILS.includes(normalizedEmail)
