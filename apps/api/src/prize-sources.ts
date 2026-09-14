/**
 * Open competitions from outside, normalized to the six prize_* columns.
 *
 * A prize NEVER creates a thread. Everything here produces candidates that the
 * enrichment pass in prize-enrich.ts may attach to a thread that already earned
 * its place on the feed - the same shape as source_url. That single rule is what
 * keeps the feed from turning into a listings board. See
 * docs/2026-09-14-prize-threads.md.
 *
 * This file is the EU SEDIA adapter. HeroX lives in prize-herox.ts and produces
 * the same PrizeCandidate shape.
 *
 * An earlier version of this comment claimed every prize aggregator "either
 * 404s, publishes no feed, or sits behind a WAF". Re-tested on 2026-09-14 and
 * that was wrong about two of them:
 *
 *   HeroX        - unauthenticated JSON, 679 challenges. See prize-herox.ts.
 *   XPRIZE       - answers POST /graphql, but only 1 track was open for
 *                  registration, so it is not worth an adapter yet.
 *   Challenge.gov- not a WAF: the platform was sunset on 2026-03-30 and the
 *                  homepage says so. api.challenge.gov no longer resolves.
 *   DARPA        - /json/opportunity.json is 156 procurement notices (BAAs,
 *                  RFIs, Industry Days) and zero prizes.
 *   Grants.gov   - works, carries no prize instrument. A grant is procurement,
 *                  a prize is an open invitation; that is a category
 *                  difference, not a taste one.
 */
import { z } from 'zod'

/** One normalized competition, before it is matched to any thread. */
export type PrizeCandidate = {
  /** Minor units, integer. Null when the sponsor publishes no amount. */
  amount: number | null
  currency: string | null
  sponsor: string
  /** The sponsor's own entry page. Required - an amount with nowhere to enter is not usable. */
  url: string
  /** ISO date, or null for rolling entries. */
  deadline: string | null
  note: string | null
  /** Sponsor's own text, used only to match against an existing thread. */
  title: string
  summary: string
}

const SEDIA_HOST = 'api.tech.ec.europa.eu'
const SEDIA_SEARCH = `https://${SEDIA_HOST}/search-api/prod/rest/search?apiKey=SEDIA`

/**
 * SEDIA status codes, read off the `actions[].status.description` label in a
 * live response on 2026-09-14 rather than guessed:
 *
 *   31094501 -> "Forthcoming"  6,856 rows, 97/100 carry a future deadline
 *   31094502 -> "Open"        14,242 rows
 *   31094503 -> "Closed"     244,911 rows
 *
 * Forthcoming and Open are both enterable futures; Closed is the archive. An
 * earlier draft of the plan had 31094502 labelled "closed", which would have
 * thrown away the larger half of the live set.
 */
const SEDIA_LIVE_STATUSES = ['31094501', '31094502']

/**
 * The action label that separates a prize from a grant inside SEDIA. Verified
 * against `SC6-Social-Innovation-Prize-2019`, whose action reads
 * "IPr Inducement Prize" and whose budget is EUR 2,000,000.
 *
 * This test is the whole adapter. Without it the pull is 21,098 Horizon
 * consortium grants - institutional research funding that nobody reading this
 * feed can enter, which is exactly the content this feature must not carry.
 */
const PRIZE_ACTION = /\bprize\b/i

const sediaResult = z.object({
  url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
const sediaResponse = z.object({
  totalResults: z.number().optional(),
  results: z.array(sediaResult).default([]),
})

/** SEDIA returns every metadata value as a one-element array of strings. */
const field = (md: Record<string, unknown> | undefined, key: string): string | null => {
  const raw = md?.[key]
  if (!Array.isArray(raw) || raw.length === 0) return null
  const first = raw[0]
  return typeof first === 'string' && first.trim() ? first : null
}

/** `2019-02-28T00:00:00.000+0000` -> `2019-02-28`. Null on anything unparseable. */
export const sediaDeadline = (raw: string | null): string | null => {
  if (!raw) return null
  const at = Date.parse(raw.replace(/\+0000$/, '+00:00'))
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null
}

/**
 * Largest year figure in `budgetOverview.budgetTopicActionMap[*][].budgetYearMap`,
 * converted to minor units.
 *
 * Largest rather than summed: the map is keyed by budget year and a prize that
 * ran across two years lists the same purse twice, so adding them would double
 * a EUR 2M prize into EUR 4M. Returns null rather than 0 when the shape is not
 * what we expect - a wrong number here is worse than a missing one.
 */
export const sediaBudgetMinor = (raw: string | null): number | null => {
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  const map = (parsed as { budgetTopicActionMap?: Record<string, unknown> })?.budgetTopicActionMap
  if (!map || typeof map !== 'object') return null
  let best = 0
  for (const actions of Object.values(map)) {
    if (!Array.isArray(actions)) continue
    for (const action of actions) {
      const years = (action as { budgetYearMap?: Record<string, unknown> })?.budgetYearMap
      if (!years || typeof years !== 'object') continue
      for (const amount of Object.values(years)) {
        if (typeof amount === 'number' && Number.isFinite(amount) && amount > best) best = amount
      }
    }
  }
  // Minor units as an integer. Math.round, not a float multiply left as-is:
  // 2_000_000 * 100 is exact but a fractional euro figure would not be, and a
  // REAL reaching the column is how a purse loses its last cent.
  return best > 0 ? Math.round(best * 100) : null
}

/** True when any action on this row is a prize rather than a grant or contract. */
export const sediaIsPrize = (rawActions: string | null, title: string): boolean => {
  if (PRIZE_ACTION.test(title)) return true
  if (!rawActions) return false
  let parsed: unknown
  try { parsed = JSON.parse(rawActions) } catch { return false }
  if (!Array.isArray(parsed)) return false
  return parsed.some(entry => {
    const types = (entry as { types?: unknown[] })?.types
    if (!Array.isArray(types)) return false
    return types.some(t => PRIZE_ACTION.test(String((t as { typeOfAction?: unknown })?.typeOfAction ?? '')))
  })
}

/** Strip the HTML SEDIA puts in its description fields down to a plain summary. */
const plain = (html: string | null, max = 400): string =>
  (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Map one SEDIA row to a candidate, or null when it is not a usable prize. */
export function sediaCandidate(row: z.infer<typeof sediaResult>, now: number): PrizeCandidate | null {
  const md = row.metadata
  const title = field(md, 'title')
  const identifier = field(md, 'identifier')
  if (!title || !identifier) return null
  if (!sediaIsPrize(field(md, 'actions'), title)) return null

  const deadline = sediaDeadline(field(md, 'deadlineDate'))
  // A past deadline is an archive row, not a candidate. The read path would
  // render it "closed" correctly, but attaching a dead competition to a thread
  // is noise we can refuse at the source.
  if (deadline && Date.parse(deadline) < now) return null

  return {
    amount: sediaBudgetMinor(field(md, 'budgetOverview')),
    currency: 'EUR',
    sponsor: 'European Commission',
    // The human entry page, not the .json the search API points at.
    url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(identifier)}`,
    deadline,
    note: null,
    title,
    summary: plain(field(md, 'descriptionByte') ?? field(md, 'additionalInfos')),
  }
}

/**
 * Pull live EU prizes. Returns [] on any failure: a prize source that breaks
 * must never stop a Scout run, because prizes are an enrichment and the feed is
 * complete without them.
 *
 * Expect [] most days. Two APIs work perfectly and neither carries an open
 * prize right now - the EU runs real ones (SOFT Innovation Prize, Horizon Prize
 * for Social Innovation) but they are rare and all currently closed. That is a
 * finding about the world, not a broken adapter, and it is why the prize filter
 * above is verified against a known archived prize rather than a live one.
 */
export async function fetchSediaPrizes(limit = 100, now = Date.now()): Promise<PrizeCandidate[]> {
  const query = JSON.stringify({
    bool: { must: [{ terms: { type: ['1', '2', '8'] } }, { terms: { status: SEDIA_LIVE_STATUSES } }] },
  })
  // The query MUST be a multipart file field. Sent as a plain query parameter
  // the endpoint returns HTTP 500, which is the kind of failure that reads like
  // an outage and is actually a calling convention.
  const body = new FormData()
  body.append('query', new Blob([query], { type: 'application/json' }), 'query.json')

  let response: Response
  try {
    response = await fetch(`${SEDIA_SEARCH}&text=prize&pageSize=${limit}&pageNumber=1`, { method: 'POST', body })
  } catch { return [] }
  if (!response.ok) return []

  let parsed: z.infer<typeof sediaResponse>
  try { parsed = sediaResponse.parse(await response.json()) } catch { return [] }

  const out: PrizeCandidate[] = []
  const seen = new Set<string>()
  for (const row of parsed.results) {
    const candidate = sediaCandidate(row, now)
    // SEDIA returns one row per language, so the same prize arrives many times.
    if (candidate && !seen.has(candidate.url)) { seen.add(candidate.url); out.push(candidate) }
  }
  return out
}
