# Techno Optimists

**Find interesting real-world problems and help solve them.**

Things can be better. We can build better.

The concept lives in [`docs/2026-09-10-concept.md`](docs/2026-09-10-concept.md) - read that first.

## What this is

A global community where people surface real-world challenges and technological ideas,
then work together to investigate, build, test, and improve solutions.

The core object is a **Challenge** — starts as a Problem, Idea, Experiment or Build,
and converges on one lifecycle: Spot -> Understand -> Ideas -> Build -> Test -> Learn -> Improve.

## Layout

```
apps/web        Astro static site: index, Challenge, post, sign-in + 6 React islands
apps/api        Hono API on Workers
packages/types  the vocabulary lock - Challenge types, stages, the 7 actions
packages/db     D1 schema + generated seed
docs/           concept, stack, decisions
scripts/        seed generation, build orchestration
```

One Worker serves both: the assets binding handles pages, the Hono app handles
`/api/*`, `/media/*` and `/c/:slug`. Same origin, so the browser never needs a
base URL or CORS.

## Stack

Picked 2026-09-10 - all Cloudflare. Astro 7 + React islands on the front, Hono on Workers
behind it, D1/R2/KV for data. Full table + why: [`docs/2026-09-10-stack.md`](docs/2026-09-10-stack.md).

## Docs

Four permanent, one job each. Anything time-boxed is `docs/YYYY-MM-DD-slug.md`, dated so
staleness shows.

| File | Job |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Rules for whoever edits: vocabulary, copy rules, how not to lose work |
| [`PRODUCT.md`](PRODUCT.md) | What is being built and why |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | One row per decision and the trap it avoids |
| [`docs/2026-09-10-concept.md`](docs/2026-09-10-concept.md) | The raw brainstorm this came from |

## Run it

Node 22 (`.nvmrc`). First time, create the local D1 tables and seed them:

```
npm install
npm run db:reset:local     # schema + 12 Challenges, 10 people, 10 updates
npm run build:web          # starts its own API on 8792, builds, stops it
npm run dev                # http://127.0.0.1:8791
```

`npm run build:web` needs nothing already running - it starts an API-only Worker
(`wrangler.build.jsonc`) because Astro fetches the live API in `getStaticPaths`,
and the build empties `apps/web/dist`, which the main config serves.

`npm test` runs the API suite. `npm run typecheck` covers the Worker.

Seed art in `apps/web/public/seed/` is generated - `node scripts/gen-seed-art.mjs`
redraws it, `node scripts/gen-seed.mjs` rebuilds `packages/db/seed.sql`.
