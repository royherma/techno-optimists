import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ChallengeDetail from '../../web/src/components/challenge/ChallengeDetail'

const effects = vi.hoisted(() => [] as Array<() => void>)
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void) => { effects.push(effect) },
}))
vi.mock('../../web/src/lib/session', () => ({ getMe: async () => null }))

afterEach(() => {
  effects.length = 0
  vi.unstubAllGlobals()
})

it.each(['/v1/c/new-thread', '/v1/c/new-thread/', '/c/new-thread'])(
  'loads the actual thread from a fallback page at %s',
  async (pathname) => {
    vi.stubGlobal('window', { location: { pathname } })
    vi.stubGlobal('document', { title: '' })
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      challenge: { slug: 'new-thread', title: 'A new thread' },
      updates: [], people: [],
    })))
    vi.stubGlobal('fetch', fetch)

    // Render the empty fallback, then run its mount effects. This exercises the
    // component's real refresh callback, not a duplicate URL-parsing formula.
    renderToStaticMarkup(createElement(ChallengeDetail))
    for (const effect of effects.splice(0)) effect()

    expect(fetch).toHaveBeenCalledWith('/api/challenges/new-thread', { cache: 'no-store' })
    await vi.waitFor(() => expect(document.title).toBe('A new thread - Techno Optimists'))
  },
)
