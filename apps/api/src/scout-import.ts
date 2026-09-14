// Append-only imports for unattended Scouts. No new credentials or schema.
export type ScoutRow = {
  slug?: string; type: string; stage: string; title: string; summary: string;
  body?: string; media: unknown[]; location?: string; lat?: number; lng?: number;
  tags: string[]; impact?: number; source_url?: string; source_name?: string;
  source_note?: string; created_at?: string; last_activity_at?: string;
  // Kept as columns rather than folded into source_note. The blob form lost the
  // boundaries between them and the page could not show a problem statement.
  problem?: string; why_unsolved?: string; evidence?: string;
  solve_status?: string; severity?: string;
}
export class ScoutInputError extends Error {}

/**
 * Empty string and known filler both become NULL, so the page's "render the
 * section only when there is something in it" check is a plain null test.
 *
 * The stub list is not paranoia: every one of these came back from the model in
 * the `status_note` field on real published rows - "No effective solution in
 * place", "Ongoing investigations", "Assessing damage and rescue efforts
 * ongoing". They pass a length check and tell a reader nothing, which is the
 * exact failure a "why is this unsolved" section exists to avoid.
 */
const STUB = /^(ongoing|no |none|n\/a|unknown|unclear|tbd|assessing|under (review|investigation)|investigation)/i
export function meaningful(value: string | undefined): string | null {
  const text = value?.trim()
  if (!text || text.length < 12 || STUB.test(text)) return null
  return text
}

export function sourceIdentity(raw: string): string {
  let u: URL
  try { u = new URL(raw) } catch { throw new ScoutInputError('invalid_source') }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new ScoutInputError('invalid_source')
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k)
  return u.href.replace(/\/$/, '')
}
export async function appendScoutRows(db: D1Database, author: string, rows: ScoutRow[], dryRun: boolean) {
  const statements: D1PreparedStatement[] = []
  const planned: { slug: string; action: 'create' | 'skip' }[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.slug || !row.source_url || !row.created_at || !/^\d{4}-\d{2}-\d{2}$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) || new Date(row.created_at).toISOString().slice(0,10) !== row.created_at) throw new ScoutInputError('scout_requires_slug_source_date')
    if (row.last_activity_at && (!/^\d{4}-\d{2}-\d{2}$/.test(row.last_activity_at) || !Number.isFinite(Date.parse(row.last_activity_at)) || new Date(row.last_activity_at).toISOString().slice(0,10) !== row.last_activity_at)) throw new ScoutInputError('invalid_activity_date')
    const source = sourceIdentity(row.source_url)
    if(seen.has(source) || seen.has(row.slug)) throw new ScoutInputError('duplicate_scout_batch')
    seen.add(source); seen.add(row.slug)
    const found = await db.prepare("SELECT id FROM challenges WHERE slug = ? OR rtrim(source_url, '/') = ? LIMIT 1").bind(row.slug, source).first()
    planned.push({ slug: row.slug, action: found ? 'skip' : 'create' })
    // The NOT EXISTS executes at write time too: another run may have inserted
    // after the read above. No UPDATE ever runs, even after a lost response.
    statements.push(db.prepare(`INSERT INTO challenges
      (id,slug,type,stage,title,summary,body,media,location,lat,lng,tags,author_id,impact,
       source_url,source_name,source_note,problem,why_unsolved,evidence,solve_status,severity,
       created_at,last_activity_at,imported_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime(?),datetime(?),datetime('now')
      WHERE NOT EXISTS (SELECT 1 FROM challenges WHERE slug = ? OR rtrim(source_url, '/') = ?)
      ON CONFLICT(slug) DO NOTHING`).bind(
        `c_${crypto.randomUUID()}`,row.slug,row.type,row.stage,row.title,row.summary,row.body??null,
        JSON.stringify(row.media),row.location??null,row.lat??null,row.lng??null,JSON.stringify(row.tags),author,row.impact??null,
        source,row.source_name??null,row.source_note??null,
        meaningful(row.problem),meaningful(row.why_unsolved),row.evidence?.trim()||null,
        row.solve_status??null,row.severity??null,
        row.created_at,row.last_activity_at??row.created_at,row.slug,source,
      ))
  }
  if (dryRun) return planned
  const results = await db.batch(statements)
  return planned.map((p,i) => ({...p, action: results[i].meta.changes > 0 ? 'create' as const : 'skip' as const}))
}
