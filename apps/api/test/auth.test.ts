import { describe, expect, it } from 'vitest'
import {
  HANDLE_MAX, HANDLE_MIN, SESSION_COOKIE, SIGNAL_COOKIE, clearCookie, cookie,
  handleFromEmail, handleProblem, hashToken, mintToken, nameFromEmail,
  normalizeEmail, normalizeHandle, readCookie, signalCookie,
} from '../src/auth'
import { adminEmails, isAdminEmail } from '../src/admin'

describe('tokens', () => {
  it('mints a 64-char hex token', () => {
    expect(mintToken()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never mints the same token twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken()))
    expect(seen.size).toBe(200)
  })

  it('hashes deterministically, and the hash is not the token', async () => {
    const t = mintToken()
    expect(await hashToken(t)).toBe(await hashToken(t))
    expect(await hashToken(t)).not.toBe(t)
  })

  it('gives different hashes for different tokens', async () => {
    expect(await hashToken('a')).not.toBe(await hashToken('b'))
  })
})

describe('email handling', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com')
  })

  it('keeps gmail dots and plus tags - they can be different people', () => {
    expect(normalizeEmail('a.b+tag@gmail.com')).toBe('a.b+tag@gmail.com')
  })

  it('derives a usable handle', () => {
    expect(handleFromEmail('sam.rivera+news@example.com')).toBe('samriveranews')
  })

  it('falls back when the local part has no usable characters', () => {
    expect(handleFromEmail('+++@gmail.com')).toBe('builder')
  })

  it('caps handle length', () => {
    expect(handleFromEmail(`${'x'.repeat(50)}@a.com`).length).toBe(20)
  })

  it('title-cases a display name', () => {
    expect(nameFromEmail('sam.rivera@example.com')).toBe('Sam Rivera')
  })
})

describe('admin emails', () => {
  const env = { ADMIN_EMAILS: 'ada@example.com,grace@example.com' }

  it('recognises every address in the list', () => {
    for (const e of adminEmails(env)) expect(isAdminEmail(env, e)).toBe(true)
  })

  it('is not admin for an address that is not listed', () => {
    expect(isAdminEmail(env, 'stranger@example.com')).toBe(false)
  })

  it('parses a comma-separated secret, trimming and lowercasing each entry', () => {
    // The secret is typed by a human into a terminal, so entries arrive with
    // stray spaces and capitals. Normalizing on read means a sloppy `secret put`
    // still matches a real sign-in instead of silently never matching.
    expect(adminEmails({ ADMIN_EMAILS: ' Ada@Example.com , grace@example.com ' }))
      .toEqual(['ada@example.com', 'grace@example.com'])
  })

  it('nobody is an admin when the secret is unset or empty', () => {
    // The fresh-clone case. A contributor gets a working site with no admin,
    // never a site that trusts an address they do not control.
    expect(adminEmails({})).toEqual([])
    expect(isAdminEmail({}, 'ada@example.com')).toBe(false)
    expect(isAdminEmail({ ADMIN_EMAILS: '' }, 'ada@example.com')).toBe(false)
    expect(isAdminEmail({ ADMIN_EMAILS: '  ,  ' }, 'ada@example.com')).toBe(false)
  })

  it('an empty email never matches an empty list entry', () => {
    // A trailing comma once produced an '' entry; an identity row with no email
    // would then have matched it and become admin.
    expect(isAdminEmail({ ADMIN_EMAILS: 'ada@example.com,' }, '')).toBe(false)
  })

  it('matches a real signin after normalization, not before', () => {
    const typedByUser = '  Ada@Example.com '
    expect(isAdminEmail(env, normalizeEmail(typedByUser))).toBe(true)
    expect(isAdminEmail(env, typedByUser)).toBe(false)
  })
})

describe('cookies', () => {
  it('is HttpOnly and SameSite=Lax', () => {
    const c = cookie('tok', true)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
  })

  it('is Secure over https and not over http', () => {
    expect(cookie('tok', true)).toContain('Secure')
    expect(cookie('tok', false)).not.toContain('Secure')
  })

  it('clears with Max-Age=0', () => {
    expect(clearCookie(false)).toContain('Max-Age=0')
  })

  it('reads its own cookie back out of a header', () => {
    const header = `other=1; ${SESSION_COOKIE}=abc123; last=2`
    expect(readCookie(header, SESSION_COOKIE)).toBe('abc123')
  })

  it('returns null when absent or headerless', () => {
    expect(readCookie('other=1', SESSION_COOKIE)).toBeNull()
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull()
  })
})

describe('the signal cookie', () => {
  it('is readable by client JS - that is the whole point', () => {
    // HttpOnly here would make it invisible to the page and the feature dead.
    expect(signalCookie('signed_in', true)).not.toContain('HttpOnly')
  })

  it('expires in well under a session, so a later visit does not re-announce', () => {
    expect(signalCookie('signed_in', true)).toContain('Max-Age=30')
  })

  it('is Secure over https and not over http', () => {
    expect(signalCookie('signed_in', true)).toContain('Secure')
    expect(signalCookie('signed_in', false)).not.toContain('Secure')
  })

  it('does not collide with the session cookie', () => {
    expect(SIGNAL_COOKIE).not.toBe(SESSION_COOKIE)
  })

  it('round-trips through the same reader the API uses', () => {
    const header = signalCookie('signed_out', false).split(';')[0]
    expect(readCookie(header, SIGNAL_COOKIE)).toBe('signed_out')
  })
})

describe('choosing a handle', () => {
  it('accepts an ordinary one', () => {
    expect(handleProblem('roy')).toBeNull()
    expect(handleProblem('mei_2')).toBeNull()
    expect(handleProblem('a1b2c3')).toBeNull()
  })

  it('names which rule was broken, so the form can say it', () => {
    expect(handleProblem('ab')).toBe('too_short')
    expect(handleProblem('x'.repeat(HANDLE_MAX + 1))).toBe('too_long')
    expect(handleProblem('roy herma')).toBe('bad_chars')
    expect(handleProblem('roy.herma')).toBe('bad_chars')
    expect(handleProblem('1234')).toBe('all_digits')
    expect(handleProblem('admin')).toBe('reserved')
  })

  it('accepts exactly the boundary lengths', () => {
    expect(handleProblem('a'.repeat(HANDLE_MIN))).toBeNull()
    expect(handleProblem('a'.repeat(HANDLE_MAX))).toBeNull()
  })

  it('rejects uppercase, because @Roy and @roy must not be two accounts', () => {
    // The route lowercases before calling this - a reader typing their own
    // handle back with a capital means the same handle. But an unnormalized
    // string reaching here is a bug, and it fails rather than creating a twin.
    expect(handleProblem('Roy')).toBe('bad_chars')
  })

  it('refuses handles that would impersonate the site or a route', () => {
    for (const h of ['admin', 'support', 'official', 'settings', 'signin', 'api']) {
      expect(handleProblem(h)).toBe('reserved')
    }
  })

  it('normalizes the way the route does before validating', () => {
    expect(normalizeHandle('  Roy  ')).toBe('roy')
    expect(handleProblem(normalizeHandle('  Roy  '))).toBeNull()
  })

  it('accepts every handle the signup derivation can produce, once long enough', () => {
    // handleFromEmail feeds straight into people.handle at signup. If it could
    // emit something this function rejects, an account would exist that its
    // owner could never save their own profile from.
    for (const email of ['sam.rivera+news@example.com', 'a_b@x.io', 'MEI@example.com']) {
      const derived = handleFromEmail(email)
      if (derived.length >= HANDLE_MIN) expect(handleProblem(derived)).toBeNull()
    }
  })
})
