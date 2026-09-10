import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwind from '@tailwindcss/vite'

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
    sitemap({ filter: (page) => !page.includes('/404') }),
  ],
  // Static output: the Worker serves /api/*, the assets binding serves the rest.
  output: 'static',
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
