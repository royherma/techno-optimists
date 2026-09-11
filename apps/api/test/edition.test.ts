import { describe, expect, it } from 'vitest'
import { app } from '../src/index'
import { editionPath, classicPath } from '../../web/src/lib/edition'

const environment = (exists: boolean, built: boolean) => ({
  DB: { prepare: () => ({ bind() { return this }, first: async () => exists ? { found: 1 } : null }) } as unknown as D1Database,
  ASSETS: { fetch: async (request: Request) => {
    const path = new URL(request.url).pathname
    if (path.endsWith('/_shell')) return new Response('live shell', { headers: { 'content-type':'text/html' } })
    if (path === '/v2/404') return new Response('edition not found', { headers: { 'content-type':'text/html' } })
    return new Response(built ? 'built challenge' : 'classic not found', { status: built ? 200 : 404 })
  } } as unknown as Fetcher,
})
describe('edition routing', () => {
  it('keeps query strings and fragment links when changing editions', () => {
    expect(editionPath('/people?handle=roy#work')).toBe('/v2/people?handle=roy#work')
    expect(editionPath('/')).toBe('/v2')
    expect(editionPath('/v2/map')).toBe('/v2/map')
    expect(classicPath('/v2/c/example')).toBe('/c/example')
    expect(classicPath('/v2')).toBe('/')
  })
  it('does not rewrite API, media or external URLs', () => {
    for (const path of ['/api/auth/callback', '/media/example.jpg', 'https://example.com', '//example.com', '#discussion']) expect(editionPath(path)).toBe(path)
  })
  it('serves a built V2 Challenge', async () => {
    const r = await app.request('/v2/c/example', {}, environment(true, true))
    expect(r.status).toBe(200); expect(await r.text()).toBe('built challenge')
  })
  it('serves the V2 shell for a Challenge created after the build', async () => {
    const r = await app.request('/v2/c/new-challenge', {}, environment(true, false))
    expect(r.status).toBe(200); expect(await r.text()).toBe('live shell')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('preserves 404 and the edition for missing Challenges', async () => {
    const r = await app.request('/v2/c/missing', {}, environment(false, false))
    expect(r.status).toBe(404); expect(await r.text()).toBe('edition not found')
  })
  it('preserves the existing Classic fallback', async () => {
    const r = await app.request('/c/new-challenge', {}, environment(true, false))
    expect(r.status).toBe(200); expect(await r.text()).toBe('live shell')
  })
  it('keeps unknown V2 screens in the newspaper shell', async () => {
    const r = await app.request('/v2/missing', {}, environment(false, false))
    expect(r.status).toBe(404); expect(await r.text()).toBe('edition not found')
  })
  it('does not expose the internal shell route', async () => {
    expect((await app.request('/v2/c/_shell', {}, environment(true, true))).status).toBe(404)
  })
})
