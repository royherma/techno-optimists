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
  it('301s a trailing-slash thread URL to the bare path, keeping the query', async () => {
    const r = await app.request('/c/example/?from=gsc', {}, environment(true, true))
    expect(r.status).toBe(301)
    const target = new URL(r.headers.get('location')!)
    expect(target.pathname).toBe('/c/example'); expect(target.search).toBe('?from=gsc')
  })
  it('301s www to the apex for pages but not for API calls', async () => {
    const page = await app.request('https://www.technooptimists.org/c/example?x=1', {}, environment(true, true))
    expect(page.status).toBe(301)
    expect(page.headers.get('location')).toBe('https://technooptimists.org/c/example?x=1')
    const api = await app.request('https://www.technooptimists.org/api/nope', { method: 'POST' }, environment(true, true))
    expect(api.status).not.toBe(301)
    const apex = await app.request('https://technooptimists.org/c/example', {}, environment(true, true))
    expect(apex.status).toBe(200)
  })
  it('301s the www front page and deep paths to the apex, keeping path and query', async () => {
    const front = await app.request('https://www.technooptimists.org/', {}, environment(true, true))
    expect(front.status).toBe(301)
    expect(front.headers.get('location')).toBe('https://technooptimists.org/')

    const deep = await app.request('https://www.technooptimists.org/c/x?a=1&b=2', { method: 'HEAD' }, environment(true, true))
    expect(deep.status).toBe(301)
    expect(deep.headers.get('location')).toBe('https://technooptimists.org/c/x?a=1&b=2')

    const sitemap = await app.request('https://www.technooptimists.org/sitemap-index.xml', {}, environment(true, true))
    expect(sitemap.status).toBe(301)
    expect(sitemap.headers.get('location')).toBe('https://technooptimists.org/sitemap-index.xml')

    const post = await app.request('https://www.technooptimists.org/', { method: 'POST' }, environment(true, true))
    expect(post.status).not.toBe(301)
  })
  it('hands apex static paths to the assets binding untouched', async () => {
    const seen: string[] = []
    const files: Record<string, Response> = {
      '/': new Response('<h1>front</h1>', { headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=0, must-revalidate' } }),
      '/sitemap-index.xml': new Response('<sitemapindex/>', { headers: { 'content-type': 'application/xml' } }),
      '/favicon.svg': new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    }
    const env = {
      ASSETS: { fetch: async (request: Request) => {
        const path = new URL(request.url).pathname
        seen.push(`${request.method} ${request.url}`)
        return files[path] ?? new Response('newspaper not found', { status: 404, headers: { 'content-type': 'text/html' } })
      } } as unknown as Fetcher,
    }

    const front = await app.request('https://technooptimists.org/', {}, env)
    expect(front.status).toBe(200)
    expect(front.headers.get('content-type')).toBe('text/html')
    expect(front.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(await front.text()).toBe('<h1>front</h1>')

    const sitemap = await app.request('https://technooptimists.org/sitemap-index.xml', {}, env)
    expect(sitemap.status).toBe(200); expect(sitemap.headers.get('content-type')).toBe('application/xml')

    const icon = await app.request('https://technooptimists.org/favicon.svg', {}, env)
    expect(icon.status).toBe(200); expect(icon.headers.get('content-type')).toBe('image/svg+xml')

    const missing = await app.request('https://technooptimists.org/no-such-page?q=1', {}, env)
    expect(missing.status).toBe(404); expect(await missing.text()).toBe('newspaper not found')

    expect(seen).toContain('GET https://technooptimists.org/no-such-page?q=1')

    const api = await app.request('https://technooptimists.org/api/nope', {}, env)
    expect(api.status).toBe(404); expect(await api.json()).toEqual({ error: 'not_found' })
    expect(seen.some((s) => s.includes('/api/'))).toBe(false)
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
