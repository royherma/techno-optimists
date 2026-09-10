import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@tailwindcss/vite'

// Tailwind v4 goes through the Vite plugin, NOT @astrojs/tailwind - that
// integration has a peer-dep conflict on Astro 7 (creators-of-today GOTCHAS #5).
export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwind()] },
  // Static output: the Worker serves /api/*, the assets binding serves the rest.
  output: 'static',
  devToolbar: { enabled: false },
  server: { port: 4321 },
})
