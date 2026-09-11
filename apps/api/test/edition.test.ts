import { describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { editionPath, classicPath } from '../../web/src/lib/edition'

const environment = (exists: boolean, built: boolean) => ({
  DB: { prepare: () => ({ bind() { return this }, first: async () => exists ? { found: 1 } : null }) } as unknown as D1Database,
  ASSETS: { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/_shell')) return new Response('live shell', { headers: { 'content-type':'text/html' } })
    if (path === '/404') return new Response('newspaper not found', { headers: { 'content-type':'text/html' } })
    if (path === '/v1/404') return new Response('classic not found', { headers: { 'content-type':'text/html' } })
    return new Response(built ? 'built challenge' : 'missing', { status: built ? 200 : 404 })
  } } as unknown as Fetcher,
})

describe('edition routing', () => {
  it('keeps query strings and fragment links when changing editions', () => {
    expect(classicPath('/people?handle=roy#work')).toBe('/v1/people?handle=roy#work')
    expect(classicPath('/')).toBe('/v1')
    expect(classicPath('/v1/map')).toBe('/v1/map')
    expect(editionPath('/v1/c/example')).toBe('/c/example')
    expect(editionPath('/v1')).toBe('/')
  })
  it('does not rewrite API, media or external URLs', () => {
    for (const path of ['/api/auth/callback', '/media/example.jpg', 'https://example.com', '//example.com', '#discussion']) {
      expect(editionPath(path)).toBe(path)
      expect(classicPath(path)).toBe(path)
    }
  })
  it('serves a built Challenge', async () => {
    const r = await app.request('/c/example', {}, environment(true, true))
    expect(r.status).toBe(200); expect(await r.text()).toBe('built challenge')
  })
  it('serves the shell for a Challenge created after the build', async () => {
    const r = await app.request('/c/new-challenge', {}, environment(true, false))
    expect(r.status).toBe(200); expect(await r.text()).toBe('live shell')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('preserves 404 for missing Challenges', async () => {
    const r = await app.request('/c/missing', {}, environment(false, false))
    expect(r.status).toBe(404); expect(await r.text()).toBe('newspaper not found')
  })
  it('keeps the Classic fallback on its own edition', async () => {
    const r = await app.request('/v1/c/new-challenge', {}, environment(true, false))
    expect(r.status).toBe(200); expect(await r.text()).toBe('live shell')
  })
  it('keeps unknown Classic screens in the Classic shell', async () => {
    const r = await app.request('/v1/missing', {}, environment(false, false))
    expect(r.status).toBe(404); expect(await r.text()).toBe('classic not found')
  })
  it('does not expose the internal shell route', async () => {
    expect((await app.request('/c/_shell', {}, environment(true, true))).status).toBe(404)
  })
  // The bug this migration fixed: / used to bounce to /v2 on every visit. The
  // old addresses stay alive, but they hand back the clean one permanently.
  it('redirects the retired /v2 addresses to the bare paths', async () => {
    const front = await app.request('/v2', {}, environment(true, true))
    expect(front.status).toBe(301)
    expect(new URL(front.headers.get('location')!).pathname).toBe('/')

    const deep = await app.request('/v2/c/example?from=mail', {}, environment(true, true))
    expect(deep.status).toBe(301)
    const target = new URL(deep.headers.get('location')!)
    expect(target.pathname).toBe('/c/example')
    expect(target.search).toBe('?from=mail')
  })
})
