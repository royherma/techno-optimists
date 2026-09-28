const ACCOUNT = 'db9eee5d30dc91c467044f8746e45206'
const PROD_DB = '195e34f1-f441-49ce-9d47-21eb7ad78209'
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`

export const fail = (msg) => {
  process.stderr.write(`${msg}\n`)
  process.exit(1)
}

const token = () => process.env.CLOUDFLARE_API_TOKEN || fail('CLOUDFLARE_API_TOKEN is not set')

export const DAYS = Number(process.env.REPORT_DAYS || 7)
if (!Number.isInteger(DAYS) || DAYS < 1) fail(`REPORT_DAYS must be a positive integer, got ${process.env.REPORT_DAYS}`)

const isoDay = (d) => d.toISOString().slice(0, 10)
const today = new Date()
export const dayOffset = (n) => isoDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - n)))

// Current window is [curStart, end), previous is [prevStart, curStart). All UTC dates.
export const end = dayOffset(-1)
export const curStart = dayOffset(DAYS - 1)
export const prevStart = dayOffset(2 * DAYS - 1)
export const windowDays = Array.from({ length: DAYS }, (_, i) => dayOffset(DAYS - 1 - i))

export async function d1(sql, params = []) {
  const res = await fetch(`${API}/d1/database/${PROD_DB}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  }).catch((e) => fail(`D1 request failed: ${e.message}`))
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.success) fail(`D1 query failed: HTTP ${res.status} ${JSON.stringify(body?.errors ?? body).slice(0, 200)}`)
  return body.result[0].results
}

export async function ae(sql) {
  const res = await fetch(`${API}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}` },
    body: `${sql} FORMAT JSON`,
  }).catch((e) => fail(`Analytics Engine request failed: ${e.message}`))
  const text = await res.text()
  if (!res.ok) fail(`Analytics Engine query failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  try { return JSON.parse(text).data } catch { fail(`Analytics Engine returned non-JSON: ${text.slice(0, 200)}`) }
}

// Analytics Engine answers 200 with zero rows for a dataset that does not exist, so prove it has data at all.
export async function aeAlive() {
  const [row] = await ae('SELECT count() AS n FROM to_events')
  if (!row || Number(row.n) === 0) fail('Analytics Engine dataset to_events returned no rows at all - dataset missing or token scoped wrong')
}

// Smoke tests sign in as @example.com and Roy's own aliases live on the site's domain; neither is a user.
export const notTestEmail = (col) => `(${col} NOT LIKE '%@example.com' AND ${col} NOT LIKE '%.test'
  AND ${col} NOT LIKE '%.invalid' AND ${col} NOT LIKE '%@technooptimists.org')`

export const fillSeries = (rows, key = 'd', val = 'n') => {
  const by = new Map(rows.map((r) => [r[key], Number(r[val])]))
  return windowDays.map((d) => [d, by.get(d) ?? 0])
}

export const emit = (out) => console.log(JSON.stringify(out))
