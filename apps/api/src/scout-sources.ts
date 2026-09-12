/** Keep IDs stable. Pause a source instead of deleting its history. */
export type ScoutFeed = { id: string; name: string; url: string; hosts: string[]; image_hosts: string[]; enabled: boolean; focus: string }
export const SCOUT_FEEDS: ScoutFeed[] = [
  { id: 'nepali-times', name: 'Nepali Times', url: 'https://nepalitimes.com/feed', hosts: ['nepalitimes.com', 'www.nepalitimes.com'], image_hosts: ["media.nepalitimes.com"], enabled: true, focus: 'Nepal: local infrastructure and environment' },
  { id: 'mongabay', name: 'Mongabay', url: 'https://news.mongabay.com/feed/', hosts: ['news.mongabay.com'], image_hosts: ["imgs.mongabay.com"], enabled: true, focus: 'Global environment and communities' },
  { id: 'mongabay-india', name: 'Mongabay India', url: 'https://india.mongabay.com/feed/', hosts: ['india.mongabay.com'], image_hosts: ["imgs.mongabay.com"], enabled: true, focus: 'India: water, farming and local environment' },
  { id: 'better-india', name: 'The Better India', url: 'https://thebetterindia.com/rss', hosts: ['thebetterindia.com', 'www.thebetterindia.com'], image_hosts: ["img-cdn.publive.online"], enabled: true, focus: 'India: practical local solutions' },
  { id: 'global-voices', name: 'Global Voices', url: 'https://globalvoices.org/feed/', hosts: ['globalvoices.org'], image_hosts: [], enabled: true, focus: 'Local community reporting worldwide' },
  { id: 'rest-of-world', name: 'Rest of World', url: 'https://restofworld.org/feed/latest/', hosts: ['restofworld.org'], image_hosts: [], enabled: true, focus: 'Technology in everyday life outside the West' },
  { id: 'hackaday', name: 'Hackaday', url: 'https://hackaday.com/blog/feed/', hosts: ['hackaday.com'], image_hosts: [], enabled: true, focus: 'Working builds and engineering experiments' },
  { id: 'cleantechnica', name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', hosts: ['cleantechnica.com'], image_hosts: [], enabled: true, focus: 'Energy, transport and deployed solutions' },
]
export const COUNTERS = ['checked', 'readable', 'approved', 'published', 'rejected', 'duplicates', 'seen', 'feed_errors', 'fetch_errors', 'model_errors', 'delivery_errors', 'storage_errors', 'model_calls', 'image_calls', 'covers_available', 'covers_used', 'cover_failures', 'generated_used'] as const
export type Counts = Record<typeof COUNTERS[number], number>
export const emptyCounts = (): Counts => Object.fromEntries(COUNTERS.map(k => [k, 0])) as Counts
export type SourceRun = {
  version: 2; slot: number; source_id: string; started_at: number; duration_ms: number;
  counts: Counts; reasons: Record<string, number>; selection: string;
  articles: { url: string; outcome: string; reasons?: string[]; slug?: string }[];
}
export function sourceRun(feed: ScoutFeed, slot: number, now: number, selection: string): SourceRun {
  return { version: 2, slot, source_id: feed.id, started_at: now, duration_ms: 0, counts: emptyCounts(), reasons: {}, selection, articles: [] }
}
const REASONS = new Set(['not_eligible', 'missing_or_stale_source_date', 'headline_formula', 'measurement_not_quoted', 'quote_not_exact', 'local_place_not_grounded', 'solved_problem_requires_restaging', 'content_audit_failed', 'invalid_model_output', 'source_text_or_date_missing'])
export function recordReasons(run: SourceRun, reasons: string[]) {
  // Free-form model explanations stay in the review record, not metric names.
  for (const reason of new Set(reasons.map(r => REASONS.has(r) ? r : 'other_evidence_failure'))) run.reasons[reason] = (run.reasons[reason] ?? 0) + 1
}
type RunMeta = { v: 2; id: string; slot: number; t: number; d: number; c: number[]; r: Record<string, number> }
export function runKey(run: Pick<SourceRun, 'slot' | 'source_id'>): string {
  return `scout:source-run:${String(9_999_999_999 - run.slot).padStart(10, '0')}:${run.source_id}`
}
export async function saveSourceRun(cache: KVNamespace, run: SourceRun) {
  const metadata: RunMeta = { v: 2, id: run.source_id, slot: run.slot, t: run.started_at, d: run.duration_ms, c: COUNTERS.map(k => run.counts[k]), r: run.reasons }
  if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > 1024) throw new Error('source_metrics_metadata_too_large')
  // No TTL: retired sources and old windows remain auditable. Deterministic key
  // means a retried final write replaces one event, never increments counters twice.
  await cache.put(runKey(run), JSON.stringify(run), { metadata })
}
export type SourceSample = Pick<SourceRun, 'slot' | 'source_id' | 'started_at' | 'duration_ms' | 'counts' | 'reasons'>
export async function sourceRunPage(cache: KVNamespace, cursor?: string) {
  const page = await cache.list<RunMeta>({ prefix: 'scout:source-run:', limit: 500, ...(cursor ? { cursor } : {}) })
  const runs: SourceSample[] = page.keys.flatMap(k => {
    const m = k.metadata
    if (!m || m.v !== 2 || m.c.length !== COUNTERS.length) return []
    return [{ slot: m.slot, source_id: m.id, started_at: m.t, duration_ms: m.d, counts: Object.fromEntries(COUNTERS.map((n, i) => [n, m.c[i]])) as Counts, reasons: m.r }]
  })
  return { runs, next_cursor: page.list_complete ? null : page.cursor }
}
export async function recentSourceRuns(cache: KVNamespace, days: number, now = Date.now()) {
  const cutoff = now - days * 86400_000
  const page = await sourceRunPage(cache)
  // At most four runs/day: 500 records comfortably cover the 90-day API window.
  // Surface truncation if a future schedule or importer increases that volume.
  const truncated = !!page.next_cursor && (!page.runs.length || page.runs.at(-1)!.started_at >= cutoff)
  return { runs: page.runs.filter(r => r.started_at >= cutoff), truncated }
}
export function wilsonLower(success: number, total: number): number {
  if (!total) return 0
  const z = 1.96, p = success / total
  return (p + z * z / (2 * total) - z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / (1 + z * z / total)
}
export function summarizeSources(feeds: ScoutFeed[], runs: SourceSample[], now = Date.now()) {
  const ids = [...new Set([...feeds.map(f => f.id), ...runs.map(r => r.source_id)])]
  return ids.map(id => {
    const feed = feeds.find(f => f.id === id)
    const history = runs.filter(r => r.source_id === id).sort((a, b) => b.started_at - a.started_at)
    const counts = emptyCounts(), reasons: Record<string, number> = {}
    for (const run of history) {
      for (const key of COUNTERS) counts[key] += run.counts[key]
      for (const [key, n] of Object.entries(run.reasons)) reasons[key] = (reasons[key] ?? 0) + n
    }
    const evaluated = Math.max(0, counts.readable - counts.model_errors)
    const enough = evaluated >= 20 && history.length >= 5
    let consecutiveFeedErrors = 0
    for (const run of history) { if (!run.counts.feed_errors) break; consecutiveFeedErrors++ }
    const lastRun = history[0]?.started_at ?? 0
    const cooldownUntil = consecutiveFeedErrors >= 3 ? lastRun + 72 * 3600_000 : 0
    const recommendation = !feed?.enabled ? 'paused' : cooldownUntil > now ? 'cooldown' : history.length >= 5 && counts.checked >= 10 && (counts.fetch_errors / counts.checked >= 0.5 || counts.readable / counts.checked < 0.2) ? 'review_fetch_or_parser' : !enough ? 'collect_more_data' : counts.approved === 0 ? 'review_for_replacement' : 'keep_testing'
    return { id, name: feed?.name ?? id, url: feed?.url ?? null, enabled: feed?.enabled ?? false, focus: feed?.focus ?? null,
      runs: history.length, last_run_at: lastRun ? new Date(lastRun).toISOString() : null,
      counts, reasons, evaluated, approval_rate: evaluated ? counts.approved / evaluated : null,
      publication_rate: counts.checked ? counts.published / counts.checked : null,
      confidence_lower_bound: wilsonLower(counts.approved, evaluated), enough_data: enough,
      cooldown_until: cooldownUntil > now ? new Date(cooldownUntil).toISOString() : null,
      recommendation,
    }
  }).sort((a, b) => Number(b.enough_data) - Number(a.enough_data) || b.confidence_lower_bound - a.confidence_lower_bound || a.id.localeCompare(b.id))
}
export function selectSource(feeds: ScoutFeed[], runs: SourceSample[], slot: number, now = Date.now()) {
  const stats = summarizeSources(feeds, runs, now)
  const available = stats.filter(s => s.enabled && !s.cooldown_until)
  if (!available.length) return null
  // Rotate by least recent service during cold start and every fourth run.
  // Once evidence accumulates, other runs favor confidence-adjusted yield.
  const oldest = [...available].sort((a, b) => (a.last_run_at ? Date.parse(a.last_run_at) : 0) - (b.last_run_at ? Date.parse(b.last_run_at) : 0) || a.runs - b.runs || a.id.localeCompare(b.id))
  const proven = available.filter(s => s.enough_data && s.counts.approved > 0)
  const overdue = oldest[0].last_run_at && now - Date.parse(oldest[0].last_run_at) > 14 * 86400_000
  const explore = slot % 4 === 0 || !proven.length || overdue
  const selected = explore ? oldest[0] : proven.sort((a,b) => b.confidence_lower_bound - a.confidence_lower_bound || (a.last_run_at ?? '').localeCompare(b.last_run_at ?? ''))[0]
  return { feed: feeds.find(f => f.id === selected.id)!, reason: explore ? 'exploration_least_recent' : 'confidence_adjusted_yield' }
}
