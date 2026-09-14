import { describe, expect, it } from 'vitest'
import {
  AI_ACTIONS, MAX_INPUT_CHARS, MAX_OUTPUT_TOKENS, MODEL_PREFERENCE,
  ProviderError, challengeOf, decryptKey, encryptKey, isAiAction, isProviderId,
  mintVerifier, providerOf,
} from '../src/ai-accounts'

const env = { AI_KEY_SECRET: 'test-secret-not-the-real-one' }

describe('PKCE', () => {
  it('mints a base64url verifier with no padding', () => {
    expect(mintVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('never mints the same verifier twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintVerifier()))
    expect(seen.size).toBe(200)
  })

  it('derives the S256 challenge deterministically, and it is not the verifier', async () => {
    const v = mintVerifier()
    expect(await challengeOf(v)).toBe(await challengeOf(v))
    expect(await challengeOf(v)).not.toBe(v)
  })

  it('matches the RFC 7636 test vector', async () => {
    // Appendix B. If this breaks, the provider will reject every exchange.
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces a url-safe challenge', async () => {
    for (let i = 0; i < 50; i++) {
      expect(await challengeOf(mintVerifier())).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('key encryption', () => {
  it('round-trips a key', async () => {
    const key = 'sk-or-v1-abc123'
    expect(await decryptKey(env, await encryptKey(env, key))).toBe(key)
  })

  it('does not store the key in the clear', async () => {
    const stored = await encryptKey(env, 'sk-or-v1-secret')
    expect(stored).not.toContain('sk-or-v1-secret')
  })

  it('uses a fresh IV, so the same key encrypts differently each time', async () => {
    const a = await encryptKey(env, 'same-key')
    const b = await encryptKey(env, 'same-key')
    expect(a).not.toBe(b)
    expect(await decryptKey(env, a)).toBe(await decryptKey(env, b))
  })

  it('refuses to decrypt under a different secret', async () => {
    const stored = await encryptKey(env, 'sk-or-v1-abc')
    await expect(decryptKey({ AI_KEY_SECRET: 'other-secret' }, stored)).rejects.toThrow()
  })

  it('refuses a tampered ciphertext rather than returning garbage', async () => {
    const stored = await encryptKey(env, 'sk-or-v1-abc')
    const [iv, ct] = stored.split('.')
    const flipped = `${iv}.${ct.slice(0, -2)}${ct.slice(-2) === 'AA' ? 'BB' : 'AA'}`
    await expect(decryptKey(env, flipped)).rejects.toThrow()
  })

  it('fails loudly when the secret is unset, never storing a key in the clear', async () => {
    await expect(encryptKey({}, 'sk-or-v1-abc')).rejects.toThrow(ProviderError)
  })

  it('rejects a malformed stored value', async () => {
    await expect(decryptKey(env, 'no-dot-here')).rejects.toThrow(ProviderError)
  })
})

describe('provider seam', () => {
  it('knows openrouter and nothing else yet', () => {
    expect(isProviderId('openrouter')).toBe(true)
    expect(isProviderId('openai')).toBe(false)
  })

  it('throws a ProviderError for an unknown provider rather than undefined', () => {
    expect(() => providerOf('nope')).toThrow(ProviderError)
  })

  it('builds an authorize url carrying the callback and an S256 challenge', () => {
    const url = providerOf('openrouter').authorizeUrl({
      callback: 'https://technooptimists.org/api/ai/callback?state=abc',
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    })
    expect(url).toContain('https://openrouter.ai/auth?')
    expect(url).toContain('code_challenge_method=S256')
    // The callback must survive encoding: its own query string is what carries
    // the state back, and an unencoded `?` would truncate it.
    expect(url).toContain(encodeURIComponent('https://technooptimists.org/api/ai/callback?state=abc'))
  })

  it('names the app on the consent screen instead of leaving it "An app"', () => {
    // A donor is about to let a stranger's site spend their money. An unnamed
    // authorize page is the sentence that makes them cancel, and an unnamed
    // key is the one they cannot find later to revoke.
    const url = providerOf('openrouter').authorizeUrl({ callback: 'https://technooptimists.org/api/ai/callback', challenge: 'x' })
    expect(url).toContain(`key_label=${encodeURIComponent('TechnoOptimists.org')}`)
  })

  it('names a provider for readers without leaking the id into copy', () => {
    expect(providerOf('openrouter').name).toBe('OpenRouter')
  })
})

describe('spend guards', () => {
  it('allowlists frontier models only, never a caller-supplied one', () => {
    expect(MODEL_PREFERENCE.length).toBeGreaterThan(0)
    for (const m of MODEL_PREFERENCE) expect(m).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/)
  })

  it('caps output and input, so a pasted novel cannot drain a donor', () => {
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(4000)
    expect(MAX_INPUT_CHARS).toBeLessThanOrEqual(50_000)
  })
})

describe('actions', () => {
  it('accepts only known actions', () => {
    for (const a of AI_ACTIONS) expect(isAiAction(a)).toBe(true)
    expect(isAiAction('drop-tables')).toBe(false)
    expect(isAiAction('')).toBe(false)
  })
})
