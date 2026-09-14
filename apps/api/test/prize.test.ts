import { describe, expect, it } from 'vitest'
import { prizeStatusOf, prizeAmountLabel, PRIZE_CLOSING_SOON_DAYS } from '../../../packages/types/index'

const now = new Date('2026-09-14T12:00:00Z')

describe('prize status is derived, never stored', () => {
  it('reads a passed deadline as closed rather than leaving a stale open prize', () => {
    expect(prizeStatusOf('2026-08-12', now)).toBe('closed')
    expect(prizeStatusOf('2026-09-14T11:59:00Z', now)).toBe('closed')
  })
  it('warns inside the closing window and stays plain outside it', () => {
    expect(prizeStatusOf('2026-09-20', now)).toBe('closing_soon')
    expect(prizeStatusOf('2027-03-12', now)).toBe('open')
    // The boundary itself is closing_soon, so a prize never skips the warning.
    const edge = new Date(now.getTime() + PRIZE_CLOSING_SOON_DAYS * 86_400_000)
    expect(prizeStatusOf(edge.toISOString(), now)).toBe('closing_soon')
  })
  it('treats a missing or unparseable deadline as rolling, not as open', () => {
    expect(prizeStatusOf(null, now)).toBe('rolling')
    expect(prizeStatusOf('whenever', now)).toBe('rolling')
  })
})

describe('prize amounts are minor units and never lose a cent to a float', () => {
  it('renders a large purse at full value', () => {
    // The regression this guards: a REAL column turning $10,000,000 into
    // $9,999,999.99. 1e9 cents must read as a clean $10M.
    expect(prizeAmountLabel(1_000_000_000, 'USD')).toBe('$10M')
    expect(prizeAmountLabel(1_500_000_000, 'USD')).toBe('$15M')
    expect(prizeAmountLabel(25_000_000, 'EUR')).toBe('€250K')
  })
  it('keeps small and mid amounts exact instead of rounding them into a K', () => {
    expect(prizeAmountLabel(750_000, 'USD')).toBe('$7,500')
    expect(prizeAmountLabel(1_00, 'GBP')).toBe('£1')
  })
  it('names an unknown currency rather than implying dollars', () => {
    expect(prizeAmountLabel(500_000, 'JPY')).toBe('5,000 JPY')
  })
  it('returns null with no amount, so a surface renders nothing instead of $0', () => {
    expect(prizeAmountLabel(null, 'USD')).toBeNull()
    expect(prizeAmountLabel(Number.NaN, 'USD')).toBeNull()
  })
})
