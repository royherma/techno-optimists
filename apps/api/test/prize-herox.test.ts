import { describe, it, expect } from 'vitest'
import { heroxAmountMinor, heroxDeadline, heroxCandidate } from '../src/prize-herox'

// Every string here was copied from a live HeroX response on 2026-09-14, not
// invented. A fixture nobody checked against the real API is a test of my
// imagination rather than of the adapter.
const NOW = Date.parse('2026-09-14T00:00:00Z')

describe('heroxAmountMinor', () => {
  it('reads a millions shorthand', () => {
    expect(heroxAmountMinor('$3.1M')).toEqual({ amount: 310_000_000, currency: 'USD' })
  })
  it('reads a thousands shorthand', () => {
    expect(heroxAmountMinor('$50K')).toEqual({ amount: 5_000_000, currency: 'USD' })
  })
  it('reads an amount buried in a sentence', () => {
    expect(heroxAmountMinor('A $45,000 total prize purse')).toEqual({ amount: 4_500_000, currency: 'USD' })
  })
  it('reads plain millions', () => {
    expect(heroxAmountMinor('$16M')).toEqual({ amount: 1_600_000_000, currency: 'USD' })
  })
  // A rupee purse is a real prize; it just cannot be stated as a number here.
  it('refuses a currency it cannot name', () => {
    expect(heroxAmountMinor('Total purse: ₹11,50,000 + Mentorship & Partnership Opportunities'))
      .toEqual({ amount: null, currency: null })
  })
  it('refuses a finished competition', () => {
    expect(heroxAmountMinor('All prizes awarded')).toEqual({ amount: null, currency: null })
  })
  it('refuses empty input', () => {
    expect(heroxAmountMinor(null)).toEqual({ amount: null, currency: null })
  })
})

describe('heroxDeadline', () => {
  it('turns days_left into a real date', () => {
    expect(heroxDeadline(10, NOW)).toBe('2026-09-24')
  })
  it('treats a missing count as rolling, not as today', () => {
    expect(heroxDeadline(null, NOW)).toBeNull()
  })
  it('refuses a non-positive count', () => {
    expect(heroxDeadline(0, NOW)).toBeNull()
    expect(heroxDeadline(-5, NOW)).toBeNull()
  })
})

// Verbatim shape of a live row.
const LIVE = {
  title: 'Connecting the Community for Maternal Health 2.0',
  url: 'https://www.herox.com/CommunityMaternalHealth2.0',
  promo: 'U.S. nonprofits and Tribes building research capacity in maternity care deserts',
  prize_short: '$3.1M',
  days_left: 10,
  stage_title: 'Enter',
  creator_title: 'Eunice Kennedy Shriver National Institute of Child Health and Human Development',
}

describe('heroxCandidate', () => {
  it('maps a live enterable row', () => {
    const c = heroxCandidate(LIVE, NOW)!
    expect(c.amount).toBe(310_000_000)
    expect(c.currency).toBe('USD')
    expect(c.sponsor).toBe(LIVE.creator_title)
    expect(c.url).toBe(LIVE.url)
    expect(c.deadline).toBe('2026-09-24')
    expect(c.summary).toContain('maternity care deserts')
  })

  it('rejects every stage that cannot be entered', () => {
    for (const stage of ['Judging', 'Judging Closed', 'Registration Closed', 'Submission Deadline', 'Pre registration']) {
      expect(heroxCandidate({ ...LIVE, stage_title: stage }, NOW)).toBeNull()
    }
  })

  // This row is live and really does sit in stage 'Enter', which is why the
  // stage check alone is not enough.
  it('rejects a finished competition still marked Enter', () => {
    expect(heroxCandidate({ ...LIVE, prize_short: 'All prizes awarded' }, NOW)).toBeNull()
  })

  it('rejects a row with no sponsor to attribute', () => {
    expect(heroxCandidate({ ...LIVE, creator_title: '  ' }, NOW)).toBeNull()
    expect(heroxCandidate({ ...LIVE, creator_title: null }, NOW)).toBeNull()
  })

  it('keeps an unparseable purse as a note rather than dropping the prize', () => {
    const c = heroxCandidate({ ...LIVE, prize_short: 'Total purse: ₹11,50,000 + Mentorship' }, NOW)!
    expect(c.amount).toBeNull()
    expect(c.note).toContain('₹11,50,000')
  })

  it('does not repeat the amount in the note when it parsed', () => {
    expect(heroxCandidate(LIVE, NOW)!.note).toBeNull()
  })

  /*
    Caught by running the adapter against the live API rather than by reading
    it: HeroX keeps years-old competitions in stage 'Enter' (Spaceport America
    Cup 2022, NASA Entrepreneurs Challenge 2023) and every one has days_left
    null. Treating that as "rolling" advertised a 2022 competition as open.
  */
  it('rejects a row with no countdown instead of calling it rolling', () => {
    expect(heroxCandidate({ ...LIVE, days_left: null }, NOW)).toBeNull()
    expect(heroxCandidate({ ...LIVE, days_left: 0 }, NOW)).toBeNull()
  })

  it('rejects a tombstone row left by a removed sponsor', () => {
    expect(heroxCandidate({ ...LIVE, creator_title: 'Deleted' }, NOW)).toBeNull()
  })
})
