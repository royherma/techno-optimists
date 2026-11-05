import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import ChallengePage, { type ChallengeData } from '../../web/src/components/newspaper/ChallengePage'

const initial = {
  challenge: {
    slug: 'nest-boxes', title: 'Room for sparrows', summary: 'Try a nest box',
    type: 'build', stage: 'build', media: [], actions: {}, views_count: 0,
    author: { handle: 'atlas' }, created_at: '2026-10-01 12:00:00',
    imported_at: '2026-10-14 12:00:00', last_activity_at: '2026-10-14 12:00:00',
  }, updates: [], people: [],
} as unknown as ChallengeData

afterEach(() => vi.restoreAllMocks())

it('keeps prerendered thread markup identical when the reader opens an older build', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-02T12:00:00Z'))
  const built = renderToString(createElement(ChallengePage, { initial }))
  now.mockReturnValue(Date.parse('2026-11-05T12:00:00Z'))
  const opened = renderToString(createElement(ChallengePage, { initial }))
  expect(opened).toBe(built)
  expect(opened).toContain('Posted <!-- -->14 Oct 2026')
})
