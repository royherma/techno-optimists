import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

async function reports(now: string, days = '7') {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
  vi.stubEnv('REPORT_DAYS', days)
  vi.resetModules()
  return import('../../../.mightymouse/reports/_cf.mjs')
}

it.each(['2026-10-19T00:00:00Z', '2026-10-19T23:59:59Z'])('excludes the unfinished UTC day at %s', async (now) => {
  const r = await reports(now)
  expect([r.prevStart, r.curStart, r.end]).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  expect(r.windowDays).toEqual([
    '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
    '2026-10-16', '2026-10-17', '2026-10-18',
  ])
  expect(r.fillSeries([{ d: '2026-10-12', n: 3 }, { d: '2026-10-19', n: 99 }]))
    .toEqual(r.windowDays.map((d: string, i: number) => [d, i === 0 ? 3 : 0]))
})

it.each([
  ['2026-01-01T00:30:00Z', '1', '2025-12-30', '2025-12-31', '2026-01-01'],
  ['2024-03-01T10:00:00Z', '1', '2024-02-28', '2024-02-29', '2024-03-01'],
  ['2026-10-19T01:00:00+07:00', '3', '2026-10-12', '2026-10-15', '2026-10-18'],
])('handles calendar boundaries and UTC: %s', async (now, days, previous, current, end) => {
  const r = await reports(now, days)
  expect([r.prevStart, r.curStart, r.end]).toEqual([previous, current, end])
  expect(r.windowDays).toHaveLength(Number(days))
  expect(r.windowDays[0]).toBe(current)
  expect(r.windowDays.every((d: string) => d < end)).toBe(true)
})

it.each(['visitors', 'errors'])('uses the same complete-day bounds for %s Analytics Engine queries', async (name) => {
  await reports('2026-10-19T15:30:00Z')
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-only')
  const queries: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = String(init.body)
    if (body.startsWith('{')) {
      const { params } = JSON.parse(body)
      expect(params).toEqual(expect.arrayContaining(['2026-10-12']))
      expect(params).not.toContain('2026-10-20')
      return new Response(JSON.stringify({ success: true, result: [{ results: [{ n: 1 }] }] }))
    }
    queries.push(body)
    return new Response(JSON.stringify({ data: body.includes('GROUP BY') ? [] : [{ n: 1 }] }))
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  if (name === 'visitors') await import('../../../.mightymouse/reports/visitors.mjs')
  else await import('../../../.mightymouse/reports/errors.mjs')
  const bounded = queries.filter((q) => q.includes('WHERE'))
  expect(bounded).toHaveLength(name === 'visitors' ? 1 : 4)
  for (const q of bounded) {
    expect(q).not.toContain('NOW()')
    const previous = q.includes('2026-10-05')
    expect(q).toContain(`timestamp >= toDateTime('${previous ? '2026-10-05' : '2026-10-12'} 00:00:00', 'UTC')`)
    expect(q).toContain(`timestamp < toDateTime('${previous ? '2026-10-12' : '2026-10-19'} 00:00:00', 'UTC')`)
  }
})
