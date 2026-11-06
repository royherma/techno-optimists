import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Challenge } from '../../../packages/types'
import StoryTile from '../../web/src/components/newspaper/StoryTile'
import StoryRow from '../../web/src/components/newspaper/StoryRow'

const challenge = {
  slug: 'nest-boxes', title: 'Room for sparrows', summary: 'Try a nest box',
  type: 'build', stage: 'build', media: [], actions: {}, views_count: 0,
  author: { handle: 'atlas' }, created_at: '2026-10-01 12:00:00',
  imported_at: '2026-10-14 12:00:00', last_activity_at: '2026-10-14 12:00:00',
} as unknown as Challenge

afterEach(() => vi.restoreAllMocks())

it.each([['tile', StoryTile], ['row', StoryRow]])('keeps prerendered feed %s markup identical when the reader opens an older build', (_, Story) => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-15T12:00:00Z'))
  const built = renderToString(createElement(Story, { challenge }))
  now.mockReturnValue(Date.parse('2026-11-05T12:00:00Z'))
  const opened = renderToString(createElement(Story, { challenge }))
  expect(opened).toBe(built)
  expect(opened).toContain('14 Oct 2026')
})
