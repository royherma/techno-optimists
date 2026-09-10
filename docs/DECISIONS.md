# Decisions

One row per decision. Newest at the bottom.

| Date | Decision | Why |
|---|---|---|
| 2026-09-10 | Repo name `techno-optimists`, own private git repo | Not a monorepo member, matches folder convention |
| 2026-09-10 | Core object named **Challenge** | Problem/Idea/Experiment/Build all converge on one lifecycle |
| 2026-09-10 | Stack deferred | Ship the shell first, pick stack when the feed spike starts |
| 2026-09-10 | Concept doc IS the raw brainstorm, no separate file | Searched repo + parent docs; a re-paste diffed identical apart from ASCII-normalized arrows/quotes |
| 2026-09-10 | Stack picked: Astro 7 + Hono/Workers + D1/R2/KV, all Cloudflare | Mirrors creators-of-today (closest product), minus its polymorphic-registry and late-analytics-split scars. See docs/2026-09-10-stack.md |
| 2026-09-10 | One `challenge_actions` table for all 7 typed actions, PK `(challenge_id, person_id, kind)` | Adding an action kind is a value, not a migration. The PK makes every action idempotent for free |
| 2026-09-10 | `seed_actions` JSON column merged with real `COUNT()` at read time | Demo scale reads as 4.7k without 4,700 fake person rows poisoning every person-level query. Marked SEED ONLY in the schema |
| 2026-09-10 | Two D1 databases from day one (`DB`, `ANALYTICS_DB`) | A telemetry burst must never be able to queue a feed read. Splitting later is a migration; splitting now is a line of config |
| 2026-09-10 | Build starts its own API (`wrangler.build.jsonc`, port 8792) | Astro fetches the live API in `getStaticPaths`, and `astro build` empties `apps/web/dist`, killing the main dev server that serves it |
| 2026-09-10 | Tailwind arbitrary vars use `bg-(--token)`, never `bg-[--token]` | v4.1 dropped the bare shorthand: it compiles to invalid `background-color:--token` and browsers discard it silently. `@theme static` so tokens used only from inline styles survive tree-shaking |
| 2026-09-10 | Seed imagery is generated SVG, not stock photos | Photo IDs written from memory did not match their captions. Local art is free, offline, and provably correct |
