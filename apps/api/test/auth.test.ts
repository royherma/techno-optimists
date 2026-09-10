import { describe, expect, it } from 'vitest'
import {
  SESSION_COOKIE, SIGNAL_COOKIE, clearCookie, cookie, handleFromEmail, hashToken,
  mintToken, nameFromEmail, normalizeEmail, readCookie, signalCookie,
} from '../src/auth'
import { ADMIN_EMAILS, isAdminEmail } from '../src/admin'

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
  it('recognises every address in the list', () => {
    for (const e of ADMIN_EMAILS) expect(isAdminEmail(e)).toBe(true)
  })

  it('is not admin for an address that is not listed', () => {
    expect(isAdminEmail('stranger@example.com')).toBe(false)
  })

  it('the list is stored normalized, so real signins match', () => {
    // isAdminEmail takes normalizeEmail() output. An entry with capitals or
    // whitespace could never match a real login, so the list itself must be
    // clean - this catches a typo when someone adds a row.
    for (const e of ADMIN_EMAILS) expect(e).toBe(normalizeEmail(e))
  })

  it('matches a real signin after normalization, not before', () => {
    const typedByUser = '  RoyHerma@Gmail.com '
    expect(isAdminEmail(normalizeEmail(typedByUser))).toBe(true)
    expect(isAdminEmail(typedByUser)).toBe(false)
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
