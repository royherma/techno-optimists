/**
 * One URL convention for every screen. The newspaper IS the site, so it owns the
 * bare paths: `/`, `/map`, `/c/<slug>`. Classic lives behind `/v1`.
 *
 * These were the other way round until the newspaper became the default. A
 * redirect from `/` to `/v2` ran on every load, so the address bar never showed
 * the URL anyone typed. Serving the newspaper at `/` removes the bounce rather
 * than hiding it.
 *
 * Business paths are never rewritten: they are served by the Worker, not by a
 * page, and prefixing one would 404.
 */
const BUSINESS = /^\/(api|media|_astro)(\/|$)/

export function editionPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || BUSINESS.test(path)) return path
  return path.replace(/^\/v1(?=[/?#]|$)/, '') || '/'
}

export function classicPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || BUSINESS.test(path)) return path
  if (/^\/v1(?:[/?#]|$)/.test(path)) return path
  return '/v1' + (path === '/' ? '' : path)
}
