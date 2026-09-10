import { describe, expect, it } from 'vitest'
import { slugify } from '../src/slug'

describe('slugify', () => {
  it('drops stop words so the URL reads', () => {
    expect(slugify('This farmer loses a third of his milk to the afternoon heat'))
      .toBe('farmer-loses-third-milk-afternoon-heat')
  })

  it('keeps stop words when too few words would survive', () => {
    expect(slugify('Is it the one?')).toBe('is-it-the-one')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(slugify('Well pump   runs dry -- again!!')).toBe('well-pump-runs-dry-again')
  })

  it('folds accents rather than dropping the word', () => {
    expect(slugify('Café solar dryer prototype')).toContain('caf')
  })

  it('never returns an empty slug', () => {
    expect(slugify('???')).toBe('challenge')
    expect(slugify('')).toBe('challenge')
  })

  it('caps length and never ends on a hyphen', () => {
    const s = slugify('a '.repeat(80) + 'extremely long title about water pumps and solar panels')
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-')).toBe(false)
  })

  it('lowercases', () => {
    expect(slugify('SHOUTING TITLE HERE')).toBe('shouting-title-here')
  })

  it('limits to six words', () => {
    expect(slugify('one two three four five six seven eight nine').split('-').length).toBe(6)
  })
})
