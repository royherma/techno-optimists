/**
 * HeroX open challenges, normalized to the same PrizeCandidate shape as SEDIA.
 *
 * HeroX hosts open competitions run by other people - NASA, NIH, XPRIZE, the
 * Department of Energy - which is exactly the relationship this feature needs:
 * the money is always someone else's and the entry always happens on their page.
 *
 * Found by reading the listing page's own bootstrap JSON, which names its data
 * source in `view.api_url`. Verified live on 2026-09-14: 679 challenges, no key,
 * no auth, no WAF. An older comment in prize-sources.ts listed HeroX among the
 * sources that "404, publish no feed, or sit behind a WAF" - that was wrong, and
 * the endpoint below is the disproof.
 */
import { z } from 'zod'
import type { PrizeCandidate } from './prize-sources'

const HEROX_SEARCH = 'https://www.herox.com/async/api-internals/public/challenge/search'

/**
 * The stage label that means entries are being accepted. HeroX also publishes
 * 'Judging', 'Judging Closed', 'Registration Closed' and 'Submission Deadline',
 * all of which are competitions you can read about but cannot enter.
 *
 * 'Pre registration' is deliberately excluded: it has no entry form yet, so
 * attaching it would point a reader at a page that cannot take their work.
 */
const ENTERABLE_STAGE = 'Enter'

/**
 * `prize_short` is free text written by the sponsor, not a number. Live values
 * include '$3.1M', '$50K', 'A $45,000 total prize purse', 'Total purse:
 * ₹11,50,000 + Mentorship & Partnership Opportunities' and 'All prizes awarded'.
 *
 * So it is parsed, never cast, and only for currencies whose symbol is
 * unambiguous. A rupee purse is a real prize and keeps its row - it simply
 * carries a null amount and renders as "Prize" with no figure, which is the
 * behaviour prizeAmountLabel() was written for.
 */
const AMOUNT = /([$€£])\s*([\d,]+(?:\.\d+)?)\s*(m|million|k|thousand|b|billion)?/i

const CURRENCY_OF: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' }

/** 'All prizes awarded' is a closed competition wearing an amount's clothes. */
const AWARDED = /\ball prizes awarded\b/i

/**
 * HeroX leaves a tombstone row when a sponsor account is removed, and it comes
 * back with creator_title 'Deleted'. That is a placeholder, not an organisation,
 * so it must never reach the "Run by ..." line on the thread page.
 */
const DELETED_SPONSOR = /^deleted$/i

/**
 * Parse a sponsor's purse string into minor units. Returns null whenever the
 * text does not carry an unambiguous figure, because a wrong amount on a money
 * claim is worse than no amount at all.
 */
export function heroxAmountMinor(raw: string | null): { amount: number | null; currency: string | null } {
  if (!raw || AWARDED.test(raw)) return { amount: null, currency: null }
  const m = AMOUNT.exec(raw)
  if (!m) return { amount: null, currency: null }
  const currency = CURRENCY_OF[m[1]]
  if (!currency) return { amount: null, currency: null }
  const base = Number(m[2].replace(/,/g, ''))
  if (!Number.isFinite(base) || base <= 0) return { amount: null, currency: null }
  const scale = /^m|^million/i.test(m[3] ?? '') ? 1_000_000
    : /^k|^thousand/i.test(m[3] ?? '') ? 1_000
    : /^b|^billion/i.test(m[3] ?? '') ? 1_000_000_000
    : 1
  // Math.round because a '$3.1M' purse is 310_000_000 minor units exactly, but a
  // fractional figure multiplied as a float is how a purse loses its last cent.
  return { amount: Math.round(base * scale * 100), currency }
}

/**
 * HeroX publishes `days_left`, not a date. Converted here so the column stores
 * a real ISO deadline rather than a number that silently rots: 10 days left is
 * only true on the day it was fetched.
 */
export const heroxDeadline = (daysLeft: number | null, now: number): string | null => {
  if (daysLeft == null || !Number.isFinite(daysLeft) || daysLeft <= 0) return null
  return new Date(now + daysLeft * 86_400_000).toISOString().slice(0, 10)
}

const heroxResult = z.object({
  title: z.string(),
  url: z.string(),
  promo: z.string().nullish(),
  prize_short: z.string().nullish(),
  days_left: z.number().nullish(),
  stage_title: z.string().nullish(),
  creator_title: z.string().nullish(),
})
const heroxResponse = z.object({
  count: z.number().optional(),
  results: z.array(heroxResult).default([]),
})

/** Map one HeroX row to a candidate, or null when it is not enterable. */
export function heroxCandidate(row: z.infer<typeof heroxResult>, now: number): PrizeCandidate | null {
  if (row.stage_title !== ENTERABLE_STAGE) return null
  // No sponsor means no attribution, and an unattributed prize is not evidence
  // of anything - the same rule the ChallengePage legal line depends on.
  const sponsor = row.creator_title?.trim()
  if (!sponsor || DELETED_SPONSOR.test(sponsor)) return null
  if (!row.url.startsWith('http')) return null
  // 'All prizes awarded' is stage 'Enter' on at least one live row, so the
  // stage check alone is not enough to keep a finished competition out.
  if (row.prize_short && AWARDED.test(row.prize_short)) return null
  /*
    A missing days_left is NOT a rolling deadline here, and this is the one
    place that rule could do real damage.

    Live pages carry stage 'Enter' rows for competitions that finished years
    ago - Spaceport America Cup 2022, NASA Entrepreneurs Challenge 2023 - and
    every one of them has days_left null. Mapping null to "rolling" would print
    "Prize · open" on a competition that closed three years ago, which is worse
    than showing no prize at all. HeroX only publishes a countdown while a
    competition is actually running, so no countdown means not running.
  */
  if (row.days_left == null || row.days_left <= 0) return null

  const { amount, currency } = heroxAmountMinor(row.prize_short ?? null)
  return {
    amount,
    currency,
    sponsor,
    url: row.url,
    deadline: heroxDeadline(row.days_left ?? null, now),
    // Keep the sponsor's own wording when it said more than a number does.
    note: row.prize_short && amount == null && !AWARDED.test(row.prize_short) ? row.prize_short.slice(0, 200) : null,
    title: row.title,
    summary: (row.promo ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }
}

/**
 * Pull live HeroX challenges. Returns [] on any failure, for the same reason
 * fetchSediaPrizes does: a prize is an enrichment, and a source outage must
 * never turn a good Scout run into a failed one.
 *
 * `page_size` is honoured up to 50 and silently ignored above it, so pages are
 * requested at 50 and walked. Verified live rather than assumed: page_size=100
 * returns 50 rows.
 */
export async function fetchHeroxPrizes(pages = 3, now = Date.now()): Promise<PrizeCandidate[]> {
  const out: PrizeCandidate[] = []
  const seen = new Set<string>()
  for (let page = 1; page <= pages; page++) {
    let response: Response
    try {
      response = await fetch(`${HEROX_SEARCH}?page_size=50&page=${page}`)
    } catch { return out }
    if (!response.ok) return out

    let parsed: z.infer<typeof heroxResponse>
    try { parsed = heroxResponse.parse(await response.json()) } catch { return out }
    if (parsed.results.length === 0) break

    for (const row of parsed.results) {
      const candidate = heroxCandidate(row, now)
      if (candidate && !seen.has(candidate.url)) { seen.add(candidate.url); out.push(candidate) }
    }
  }
  return out
}
