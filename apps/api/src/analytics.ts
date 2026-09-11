/**
 * One event, fire and forget. Never awaited and never allowed to throw: a
 * telemetry failure must not turn a working page into a 500, which is the
 * usual way analytics takes a site down.
 *
 * Lives in its own module rather than index.ts because community.ts writes
 * events too, and index.ts mounts community.ts - importing it back would be a
 * cycle.
 *
 * The column layout is fixed by Analytics Engine - blobs are strings, doubles
 * are numbers, and there is one index, which is the sampling/grouping key.
 *
 * Read it back over the SQL API (POST, the query as the raw body, a token with
 * Account Analytics Read - the wrangler OAuth token already carries it):
 *   https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql
 *
 *   SELECT blob1 AS path, blob2 AS kind, double2 AS status, count() AS n
 *   FROM to_events WHERE timestamp > NOW() - INTERVAL '24' HOUR
 *   GROUP BY path, kind, status ORDER BY n DESC
 *
 * `timestamp` is UTC. A window of '1' HOUR against a +07 wall clock returns
 * nothing and reads exactly like "telemetry is broken" - it is not.
 *
 * A dataset that does not exist also answers 200 with count() = 0, so an empty
 * result never proves the write path works. Query without a time filter first.
 */
export const track = (
  env: { ANALYTICS?: AnalyticsEngineDataset },
  kind: string,
  path: string,
  extra: { country?: string; referrer?: string; ms?: number; status?: number } = {},
) => {
  try {
    env.ANALYTICS?.writeDataPoint({
      // blob1 path, blob2 kind, blob3 country, blob4 referrer - positional, so
      // the order here is the schema. Append, never reorder.
      blobs: [path, kind, extra.country ?? '', extra.referrer ?? ''],
      doubles: [extra.ms ?? 0, extra.status ?? 0],
      // The index is what queries group by cheaply, and its cardinality is what
      // costs: kind is a handful of values, a path or a user id would not be.
      indexes: [kind],
    })
  } catch { /* telemetry is never worth a request */ }
}
