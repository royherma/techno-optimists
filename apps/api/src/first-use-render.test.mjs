import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FrontPage from '../../web/src/components/newspaper/FrontPage'

const thread = (index, type = 'problem') => ({
  id: String(index), slug: `thread-${index}`, title: `Actual thread title ${index}`,
  summary: 'A real context to browse.', type, stage: 'understand', media: [],
  actions: { have_problem: 0, want_this: 0, have_idea: 0, can_help: 0 },
})

describe('front-page HTML before hydration', () => {
  it('renders five actual titles and ten usable thread links from a larger initial feed', () => {
    const html = renderToStaticMarkup(createElement(FrontPage, { initial: Array.from({ length: 50 }, (_, i) => thread(i)) }))
    expect(html.match(/<h2>/g)).toHaveLength(5)
    expect(html.match(/href="\/c\/thread-/g)).toHaveLength(10)
    expect(html).toContain('Actual thread title 0')
    expect(html).not.toContain('Actual thread title 5')
    expect(html).not.toContain('np-skeleton')
    expect(html).toContain('aria-busy="false"')
  })
  it('keeps problem-first ordering in the initial edition', () => {
    const html = renderToStaticMarkup(createElement(FrontPage, { initial: [thread(0, 'idea'), thread(1), thread(2), thread(3), thread(4, 'build')] }))
    const titles = [...html.matchAll(/<h2><a[^>]*>([^<]*)/g)].map(match => match[1])
    expect(titles).toEqual([1, 2, 0, 3, 4].map(i => `Actual thread title ${i}`))
  })
  it('keeps the loading state when no initial content exists', () => {
    const html = renderToStaticMarkup(createElement(FrontPage, { initial: [] }))
    expect(html.match(/class="np-story np-skeleton/g)).toHaveLength(5)
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('href="/c/')
  })
})
