/*
 * The site's structured data, and the one place it is defined.
 *
 * It lives in its own .mjs module rather than inside Base.astro because two
 * things need the exact same bytes: the layout that renders the tag, and
 * astro.config.mjs, which has to declare a CSP hash for it.
 *
 * Why a hash is needed at all. The build emits a per-page meta CSP with
 * `script-src 'self'` plus a sha256 for every inline script Astro itself
 * generated. Astro computes those for island hydration, directive content and
 * the prebuilt island runtime (node_modules/astro/dist/core/csp/common.js,
 * ~line 91-113). A hand-written <script type="application/ld+json"> is none of
 * those, so it never enters the list and the browser refuses it - the tag ships
 * in the HTML and is then dropped at parse time. That was measured, not
 * assumed: the emitted tag hashed to
 * sha256-UTj24gb34RXB8ohMMDFxcaJPgAnYrLf3Psd4u4X9jGI= against eight unrelated
 * CSP hashes. Google's renderer honours CSP, so a blocked tag is invisible
 * structured data.
 *
 * Hence SCHEMA_JSON: the serialized string is the shared artifact. The config
 * hashes that exact string, the layout prints that exact string, and there is
 * no way for the two to drift - edit the object and the hash follows on the
 * next build. Never inline this JSON into a page or paste the hash as a
 * literal; that reintroduces the drift this module exists to remove.
 */
export const ORIGIN = 'https://technooptimists.org'

const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Techno Optimists',
      url: ORIGIN,
      logo: `${ORIGIN}/icon-192.png`,
      description:
        'A global community of people using technology to understand real-world problems, try ideas and build better solutions together.',
      parentOrganization: { '@type': 'Organization', name: 'Techguyver Labs, LLC' },
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: ORIGIN,
      name: 'Techno Optimists',
      description: 'Find interesting real-world problems and help solve them.',
      publisher: { '@id': `${ORIGIN}/#organization` },
      inLanguage: 'en',
    },
  ],
}

/*
 * No SearchAction / sitelinks searchbox: it requires a real query endpoint and
 * there is no /search route to point one at. No `sameAs`: inventing profile
 * URLs would be a fabricated claim, and an absent property costs nothing.
 */
export const SCHEMA_JSON = JSON.stringify(schema)
