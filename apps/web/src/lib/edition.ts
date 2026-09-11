/** One URL convention for every screen. Business/API paths stay unversioned. */
export function editionPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || /^\/(api|media|_astro)(\/|$)/.test(path)) return path
  if (/^\/v2(?:[/?#]|$)/.test(path)) return path
  return '/v2' + (path === '/' ? '' : path)
}
export function classicPath(path: string) {
  return path.replace(/^\/v2(?=\/|$)/, '') || '/'
}
