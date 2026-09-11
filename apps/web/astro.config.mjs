import { createHash } from 'node:crypto'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwind from '@tailwindcss/vite'
import { SCHEMA_JSON } from './src/lib/schema.mjs'

// The JSON-LD tag Base.astro prints is an inline script, and the CSP below is
// `script-src 'self'` plus hashes. Astro computes hashes for the inline scripts
// it generates itself - island hydration, directive content, the prebuilt
// island runtime - but not for a hand-written one, so without this line the tag
// is emitted and then refused at parse time. Measured, not assumed: the built
// page hashed to sha256-UTj24gb... against eight unrelated CSP hashes.
//
// Hashing the same exported string the layout renders is what keeps the two in
// step - edit the schema and this follows on the next build. A pasted literal
// would go stale silently.
const SCHEMA_HASH = `sha256-${createHash('sha256').update(SCHEMA_JSON, 'utf8').digest('base64')}`

// Tailwind v4 goes through the Vite plugin, NOT @astrojs/tailwind - that
// integration has a peer-dep conflict on Astro 7 (creators-of-today GOTCHAS #5).
export default defineConfig({
  // The sitemap integration emits nothing at all without `site`, and every URL
  // it writes is absolute against it. This is the canonical origin even when
  // the build is deployed to dev - a sitemap describes the public site, not
  // whichever mirror happens to serve it.
  site: 'https://technooptimists.org',
  integrations: [
    react(),
    // /404 is noindex (see Base.astro), so listing it here would contradict
    // the page's own meta.
    // /v1 is Classic: a second rendering of the same Challenges, canonicalised
    // to its newspaper twin. Listing those URLs would advertise ~30 duplicates
    // of pages already in this file.
    sitemap({ filter: (page) => !page.includes('/404') && !page.includes('/c/_shell') && !page.includes('/people') && !/\/v1(\/|$)/.test(new URL(page).pathname) }),
  ],
  // Static output: the Worker serves /api/*, the assets binding serves the rest.
  output: 'static',
  security: {
    // Astro emits a per-page <meta http-equiv="content-security-policy"> and
    // computes a sha256 for every inline script and style it generated. That
    // matters here: island hydration ships three inline <script> blocks with
    // real bodies, so a hand-written `script-src 'self'` would break the page,
    // and a hand-copied hash list would go stale on the next build. Astro
    // regenerates the hashes each build instead.
    //
    // The Worker sends the transport-level headers (HSTS, frame-ancestors,
    // nosniff) - a <meta> CSP cannot carry frame-ancestors at all.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        // Google Fonts: the stylesheet comes from googleapis, the font files
        // from gstatic. Both are in Base.astro's <head>.
        'font-src https://fonts.gstatic.com',
        // R2 media is served same-origin through /media/*, so 'self' covers it.
        // data: is for the inline SVGs the map draws.
        "img-src 'self' data: https://tile.openstreetmap.org",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: {
        hashes: [SCHEMA_HASH],
      },
      styleDirective: {
        // Tailwind is a real stylesheet ('self'); this adds the font CSS origin
        // alongside whatever hashes Astro computes for its own inline styles.
        resources: [
          "'self'", 'https://fonts.googleapis.com',
          // Data-driven colors and media ratios use attributes, which Astro's
          // style-block hashes do not cover. Keep scripts/stylesheets strict.
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
  devToolbar: { enabled: false },
  server: { port: 4321 },
  vite: {
    plugins: [tailwind()],
    // In production one Worker serves pages, /api/* and /media/*. `astro dev`
    // serves only the pages, so images and API calls 404 and the dev page is a
    // misleading picture of the real one. Proxy both to the local API Worker.
    server: {
      proxy: {
        '/api': { target: 'http://127.0.0.1:8791', changeOrigin: true },
        '/media': { target: 'http://127.0.0.1:8791', changeOrigin: true },
      },
    },
  },
})
