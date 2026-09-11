/**
 * Who is an admin.
 *
 * The list is configuration, not source. It lives in the `ADMIN_EMAILS` secret as
 * a comma-separated string, because this repo is public: an address in source is
 * an address every scraper on GitHub gets, and it names the exact two mailboxes
 * an attacker has to compromise to own the site. It grants nothing on its own -
 * an admin still proves the mailbox through the magic-link flow - but there is no
 * reason to publish the target.
 *
 * Changing it is `wrangler secret put ADMIN_EMAILS --env prod` and no deploy,
 * which is fewer steps than the edit-and-deploy this replaced, not more.
 *
 * Unset means nobody is an admin. That is the right default for a fresh clone:
 * a contributor running this locally gets a working site with no admin, never
 * someone else's admin.
 *
 * The rule is unchanged: this list decides, `identities.is_admin` caches. Every
 * session resolve rewrites the column to agree, so adding an address promotes an
 * existing account on its next request and removing one demotes it. There is no
 * third place to check.
 */

export type AdminEnv = { ADMIN_EMAILS?: string }

/**
 * Parsed per call rather than cached in a module global. A Worker isolate
 * outlives a single request, so a cached list would go stale against a
 * `secret put` until the isolate recycled - the exact "no deploy needed"
 * property this exists for. Splitting a short string per request costs nothing.
 *
 * Entries are normalized on read, so a stray capital or space in the secret
 * still matches a real sign-in instead of silently never matching.
 */
export const adminEmails = (env: AdminEnv): string[] =>
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

/**
 * Takes an already-normalized email. Callers must pass the output of
 * normalizeEmail(), never a raw address - otherwise 'Roy@Gmail.com ' misses.
 */
export const isAdminEmail = (env: AdminEnv, normalizedEmail: string): boolean =>
  normalizedEmail.length > 0 && adminEmails(env).includes(normalizedEmail)
