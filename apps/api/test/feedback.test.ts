import { expect, it } from 'vitest'
import { feedbackHref } from '../../web/src/lib/feedback'

it('identifies the reader thread in feedback while preserving the three questions', () => {
  const link = new URL(feedbackHref('/c/new-thread'))
  expect(link.protocol).toBe('mailto:')
  expect(link.pathname).toBe('roy@techguyverlabs.org')
  expect(link.searchParams.get('subject')).toBe('Techno Optimists feedback')
  expect(link.searchParams.get('body')).toBe('What is missing?\n\n\nWhat broke?\n\n\nWhat do you want here?\n\n\nPage: https://technooptimists.org/c/new-thread')
})

it('omits query values and fragments from feedback context', () => {
  const body = new URL(feedbackHref('/signin?token=private&next=/settings#account')).searchParams.get('body')
  expect(body).toContain('Page: https://technooptimists.org/signin')
  expect(body).not.toMatch(/private|token|next|account/)
})
