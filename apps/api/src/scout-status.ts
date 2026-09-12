export const SCOUT_STALE_MS = 15 * 60_000
export function scoutRunStatus(value: unknown, now = Date.now()): unknown {
  if (!value || typeof value !== 'object') return value
  const run = value as Record<string, unknown>
  if (run.status !== 'running') return run
  const heartbeat = Date.parse(String(run.updated_at ?? run.started_at ?? ''))
  if (!Number.isFinite(heartbeat) || now - heartbeat < SCOUT_STALE_MS) return run
  return { ...run, status: 'interrupted', interruption_reason: 'No progress checkpoint within 15 minutes', detected_at: new Date(now).toISOString(), counts_partial: true }
}
