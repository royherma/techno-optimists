import { describe, expect, it } from 'vitest'
import { sediaBudgetMinor, sediaDeadline, sediaIsPrize, sediaCandidate } from '../src/prize-sources'
import { shareVocabulary } from '../src/prize-enrich'

/**
 * Shapes below are copied from a live SEDIA response on 2026-09-14, not
 * invented: SC6-Social-Innovation-Prize-2019 is a real archived EU prize whose
 * action reads "IPr Inducement Prize" and whose budget is EUR 2,000,000.
 */
const PRIZE_BUDGET = JSON.stringify({
  budgetTopicActionMap: {
    '3254750': [{
      action: 'SC6-Social-Innovation-Prize-2019 - IPr Inducement Prize',
      deadlineDates: ['28 February 2019'],
      budgetYearMap: { '2016': 2000000 },
    }],
  },
})
const PRIZE_ACTIONS = JSON.stringify([
  { status: { id: 31094502, description: 'Open' }, types: [{ typeOfAction: 'IPr Inducement Prize' }] },
])
const GRANT_ACTIONS = JSON.stringify([
  { status: { id: 31094501, description: 'Forthcoming' }, types: [{ typeOfAction: 'DIGITAL JU Coordination and Support Actions' }] },
])

describe('SEDIA budget parsing keeps a purse exact', () => {
  it('reads EUR 2,000,000 as minor units', () => {
    expect(sediaBudgetMinor(PRIZE_BUDGET)).toBe(200_000_000)
  })
  it('takes the largest year, never the sum, so a two-year prize is not doubled', () => {
    const twoYears = JSON.stringify({
      budgetTopicActionMap: { a: [{ budgetYearMap: { '2016': 2000000, '2017': 2000000 } }] },
    })
    expect(sediaBudgetMinor(twoYears)).toBe(200_000_000)
  })
  it('returns null instead of 0 on a missing or malformed budget', () => {
    expect(sediaBudgetMinor(null)).toBeNull()
    expect(sediaBudgetMinor('not json')).toBeNull()
    expect(sediaBudgetMinor('{}')).toBeNull()
  })
})

describe('SEDIA deadlines normalize to an ISO date', () => {
  it('trims the EU timestamp form', () => {
    expect(sediaDeadline('2019-02-28T00:00:00.000+0000')).toBe('2019-02-28')
  })
  it('returns null rather than an Invalid Date', () => {
    expect(sediaDeadline(null)).toBeNull()
    expect(sediaDeadline('whenever')).toBeNull()
  })
})

describe('the prize filter is what separates this from 21,098 grants', () => {
  it('accepts an inducement prize', () => {
    expect(sediaIsPrize(PRIZE_ACTIONS, 'Horizon Prize for Social Innovation')).toBe(true)
  })
  it('rejects a Horizon consortium grant, which is the bulk of the corpus', () => {
    expect(sediaIsPrize(GRANT_ACTIONS, 'Call for Design Platform')).toBe(false)
  })
  it('still catches a prize whose action label is missing but whose title says so', () => {
    expect(sediaIsPrize(null, 'SOFT Innovation Prize')).toBe(true)
  })
})

describe('candidate mapping refuses unusable rows', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    metadata: {
      title: ['Horizon Prize for Social Innovation'],
      identifier: ['SC6-Social-Innovation-Prize-2019'],
      actions: [PRIZE_ACTIONS],
      budgetOverview: [PRIZE_BUDGET],
      deadlineDate: ['2027-02-28T00:00:00.000+0000'],
      descriptionByte: ['<p>Reduce <b>flooding</b> in coastal towns</p>'],
      ...over,
    },
  })
  const now = Date.parse('2026-09-14T00:00:00Z')

  it('maps a live prize to an entry URL a person can actually open', () => {
    const c = sediaCandidate(row(), now)!
    expect(c.amount).toBe(200_000_000)
    expect(c.currency).toBe('EUR')
    expect(c.deadline).toBe('2027-02-28')
    // The portal page, not the .json the search API indexes.
    expect(c.url).toContain('/portal/screen/opportunities/topic-details/SC6-Social-Innovation-Prize-2019')
    expect(c.summary).toBe('Reduce flooding in coastal towns')
  })
  it('drops a competition whose deadline already passed', () => {
    expect(sediaCandidate(row({ deadlineDate: ['2019-02-28T00:00:00.000+0000'] }), now)).toBeNull()
  })
  it('drops a grant even when everything else is well formed', () => {
    expect(sediaCandidate(row({ actions: [GRANT_ACTIONS], title: ['Call for Design Platform'] }), now)).toBeNull()
  })
  it('keeps a rolling prize, which has no deadline rather than an unknown one', () => {
    const c = sediaCandidate(row({ deadlineDate: [] }), now)!
    expect(c.deadline).toBeNull()
  })
})

describe('the pre-filter refuses a topic-only overlap', () => {
  const candidate = {
    amount: null, currency: 'EUR', sponsor: 'European Commission', url: 'https://example.org',
    deadline: null, note: null,
    title: 'Prize for affordable borehole pump repair',
    summary: 'Award for a durable repair method for hand-operated borehole pumps',
  }
  it('passes a thread that shares the physical subject', () => {
    expect(shareVocabulary(candidate, {
      id: '1', title: 'This village well pump runs dry every March',
      summary: 'The borehole pump seizes and the nearest repair is 60km away',
      problem_key: 'borehole pump failure', tags: ['water'],
    })).toBe(true)
  })
  it('rejects a thread sharing only a stopword-tier sector term', () => {
    expect(shareVocabulary(
      { ...candidate, title: 'European Innovation Prize', summary: 'A new call for innovation projects in Europe' },
      { id: '2', title: 'This school loses milk to heat', summary: 'Cooling fails overnight', problem_key: null, tags: ['innovation'] },
    )).toBe(false)
  })
})
