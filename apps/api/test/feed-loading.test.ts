import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FrontPage from '../../web/src/components/newspaper/FrontPage'
import { readFeedCache, writeFeedCache } from '../../web/src/lib/feed-cache'
import type { Challenge } from '../../../packages/types'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('newspaper first paint', () => {
  it('renders a responsive skeleton instead of an unmeasured story layout', () => {
    const html = renderToStaticMarkup(createElement(FrontPage, { initial: [] }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Setting the edition')
    expect(html).not.toContain('What could be better?')
    expect(html).not.toContain('np-edition-ready')
  })
})

describe('public feed session cache', () => {
  function storage() {
    const values = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    return values
  }
  it('keeps a recent empty feed and expires it after five minutes', () => {
    storage()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    writeFeedCache([])
    expect(readFeedCache()).toEqual([])
    now.mockReturnValue(302000)
    expect(readFeedCache()).toBeNull()
  })
  it('rejects corrupt or incomplete records', () => {
    const values = storage()
    values.set('to:public-feed:v1', '{')
    expect(readFeedCache()).toBeNull()
    writeFeedCache([{ title: 'incomplete' }] as Challenge[])
    expect(readFeedCache()).toBeNull()
  })
  it('keeps browsing available when storage is blocked', () => {
    vi.stubGlobal('sessionStorage', { getItem() { throw Error('blocked') }, setItem() { throw Error('full') } })
    expect(readFeedCache()).toBeNull()
    expect(() => writeFeedCache([])).not.toThrow()
  })
})
