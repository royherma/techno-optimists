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
| 2026-09-10 | The index is drawn as a survey sheet: neatline, title block, margin graticule, scale bar, north arrow | The reference design's whole argument is that the page is an object with edges. Without the furniture it reads as a feed with a border |
| 2026-09-10 | Contour rings carry the stage colour, ring count carries impact | Black rings spent a channel on nothing. Count says how far a Challenge reaches, colour says what is being done about it - one glance, two facts |
| 2026-09-10 | The legend shows every tier, never a sample | A legend listing 3 of 5 ring tiers leaves the reader guessing at the two it skipped, which is the one thing a legend exists to prevent |
| 2026-09-10 | Action glyphs are taught once in the legend, then used unlabelled on every row | Symbols survive translation and cost one glance instead of a sentence. This is the payoff for having a legend at all |
| 2026-09-10 | Rules between grid columns go on the stretched grid item, never on a sticky inner box | A border on a sticky element stops where its content stops, leaving the bottom of a long sheet unruled |
| 2026-09-10 | A missing media object drops the `<img>` and keeps the tinted plate | The box is already the right shape and colour, so a dead R2 key reads as intentional rather than as a broken page |
| 2026-09-10 | Static pages are the fast path; a Challenge posted since the last build is filled in client-side from `window.__LIVE_CHALLENGE__` | `output: 'static'` prerenders only what existed at build time, so fresh Challenges 404. Serving an existing page as the shell keeps one template instead of a second that drifts |
| 2026-09-10 | The action bar fetches its own Challenge rather than reading props | A DOM `setAttribute` cannot reach a mounted React island, so the bar showed the shell's type and counts |
| 2026-09-10 | Email is stored in `identities`, never on `people` | A `SELECT p.*` on the person table can then never leak an address into an API response |
| 2026-09-10 | Sign-in links carry `?next=`, and acting while signed out returns to the Challenge | Asking for a sign-in at the moment of contribution only works if the reader lands back where they were |
| 2026-09-10 | Capture and sign-in render inside the same `Sheet` as the index | They are pages of one document. A bare card on the graph paper reads as a different site |
| 2026-09-10 | `dev_link` is returned only when `ENVIRONMENT !== 'prod'`; prod fails closed | The magic link is a bearer token. Returned unconditionally, POSTing a stranger's address hands over their account. A missing mail key in prod must break sign-in loudly, never open a door |
| 2026-09-10 | Deploying dev is two steps: `db:reset:dev` then `deploy:dev`, whenever the schema moved | `schema.sql` shipped `identities`/`magic_links`/`sessions` after the last dev reset, so live sign-in 500'd on `no such table: magic_links` while every local test passed |
