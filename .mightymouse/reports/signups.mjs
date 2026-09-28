import { d1, emit, fillSeries, notTestEmail, curStart, prevStart, end } from './_cf.mjs'

// An email that never redeemed a link has no identity row, so COALESCE keeps it as outside.
const OUTSIDE_LINKS = `
  SELECT m.email, m.created_at, m.used_at FROM magic_links m
  LEFT JOIN identities i ON i.email = m.email
  WHERE COALESCE(i.is_admin, 0) = 0 AND ${notTestEmail('m.email')}
    AND m.created_at >= ?1 AND m.created_at < ?2`

const [cur, prev] = await Promise.all([d1(OUTSIDE_LINKS, [curStart, end]), d1(OUTSIDE_LINKS, [prevStart, curStart])])

const emails = (rows) => new Set(rows.map((r) => r.email)).size
const perDay = new Map()
for (const r of cur) {
  const d = r.created_at.slice(0, 10)
  if (!perDay.has(d)) perDay.set(d, new Set())
  perDay.get(d).add(r.email)
}

emit({
  value: emails(cur),
  previous: emails(prev),
  series: fillSeries([...perDay].map(([d, s]) => ({ d, n: s.size }))),
  rows: [
    ['asked for a sign-in link', emails(cur)],
    ['clicked the link', emails(cur.filter((r) => r.used_at))],
  ],
})
