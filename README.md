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
apps/web        Astro static site: index, Challenge, post, sign-in + React islands
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

## Running it

`make` on its own lists every target. The ones that matter:

| Command | What it does |
|---|---|
| `make dev` | API on :8791 and the site on :4321, together |
| `make reset` | rebuild local D1 and load the seed fixtures |
| `make check` | typecheck + tests |
| `make ship` | typecheck, test, migrate additively, deploy prod, verify |
| `make ship-dev` | same for the dev worker, seeds and all |
| `make verify` | probe the live site end to end |
| `make logs` | tail prod |

Every target delegates to an npm script, so `npm run ship` works the same.

### Two environments

| | dev | prod |
|---|---|---|
| Address | `techno-optimists-dev.techguyver1337.workers.dev` | `technooptimists.org` |
| Data | throwaway, seeded | real, starts empty |
| Sign-in | returns `dev_link` in the response | mails the link, fails closed |

Binding **names** are identical in both, so no code branches on environment - only
the IDs behind them differ.

**Production builds read the production API.** Development builds read local D1.
`ship` applies additive migrations before deploying; it never resets existing data.
`schema.sql` is a destructive reset fixture for a new local database, not a migration.

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

## Working with multiple agents

Run `npm run agents:status` to see who holds the build/deploy lock, or the last
operation when idle. Use `AGENT_NAME=my-task npm run ship:dev` to identify your run.
Root build, database and deployment scripts serialize automatically across local
Git worktrees; a busy command exits with code 75 so you can retry later. Python 3
is required. See [AGENTS.md](AGENTS.md) for scope and simultaneous-edit rules.

## Challenge discussion and editorial tools

`ChallengeDetail` owns the live detail page, with separate discussion and progress
composers. Comments have optional labels and replies; progress updates may change
stage only when published by the Challenge author or an admin.

An admin sees **Edit Challenge** on each detail page, including a single optional
emoji. Topic tags remain stored but are not displayed in the feed.

- `npm run db:migrate:local` / `db:migrate:dev` / `db:migrate:prod`: repeatable,
  additive community schema migration, under the shared operation lock.
- `npm run test:community:local`: real HTTP checks on localhost:8795, including
  local-only sign-in, imports, comments, replies and admin editing. Start
  `npm run dev -- --port 8795` first. The test refuses remote hosts.
- `packages/db/editorial-2026-09-11.sql`: one-time curated emojis and the sourced
  Tokyo copy correction. Run via `db:editorial:local` or `db:editorial:prod`; it is
  not part of recurring deployment, so removing an emoji stays an admin choice.

The private `/c/_shell` asset is always built and excluded from the sitemap.
`/c/*` runs through the Worker so a new Challenge gets a working page immediately,
without borrowing another Challenge's content or injecting unhashed scripts.
