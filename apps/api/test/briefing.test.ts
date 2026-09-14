import { describe, expect, it } from 'vitest'
import { decodeEntities } from '../src/scout-cloudflare'
import { meaningful } from '../src/scout-import'

describe('decodeEntities', () => {
  // The bug this exists for: scraped article text carries raw entities, the
  // model copies them into a quoted excerpt verbatim, React escapes them again,
  // and the page prints "&mdash;" in the middle of a sentence.
  it('decodes the entity that shipped to production', () => {
    expect(decodeEntities('their Vanaspati Ganesh &mdash; a tradition'))
      .toBe('their Vanaspati Ganesh — a tradition')
  })

  it('decodes named, decimal and hex forms', () => {
    expect(decodeEntities('a &amp; b')).toBe('a & b')
    expect(decodeEntities('caf&eacute;')).toBe('café')
    expect(decodeEntities('&#8212;')).toBe('—')
    expect(decodeEntities('&#x2014;')).toBe('—')
  })

  it('leaves text that is not an entity alone', () => {
    // A bare ampersand is far more common in article text than an entity and
    // must survive untouched: "R&D spending" is not markup.
    expect(decodeEntities('R&D spending rose 4%')).toBe('R&D spending rose 4%')
    expect(decodeEntities('&notreal; stays')).toBe('&notreal; stays')
  })

  it('refuses code points that String.fromCodePoint would throw on', () => {
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')   // lone surrogate
    expect(decodeEntities('&#999999999;')).toBe('&#999999999;')
  })

  it('returns an empty string for absent input', () => {
    expect(decodeEntities(undefined)).toBe('')
  })
})

describe('meaningful', () => {
  // Every string here was returned by the model in status_note on a row that is
  // live in production. They pass a length check and answer nothing, which is
  // why a length check alone was not enough.
  it('rejects the filler that made the old section useless', () => {
    expect(meaningful('No effective solution in place')).toBeNull()
    expect(meaningful('Ongoing investigations')).toBeNull()
    expect(meaningful('Assessing damage and rescue efforts ongoing')).toBeNull()
    expect(meaningful('Unknown')).toBeNull()
  })

  it('keeps a reason that names an actual obstacle', () => {
    const real = 'Access roads to the valley are washed out, so repair crews cannot reach the turbines.'
    expect(meaningful(real)).toBe(real)
  })

  it('treats blank and too-short input as absent', () => {
    expect(meaningful(undefined)).toBeNull()
    expect(meaningful('   ')).toBeNull()
    expect(meaningful('too short')).toBeNull()
  })

  it('trims rather than rejecting padded real text', () => {
    expect(meaningful('  The pump needs a part nobody stocks locally.  '))
      .toBe('The pump needs a part nobody stocks locally.')
  })
})
