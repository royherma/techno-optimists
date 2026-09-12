# 🌍 Techno Optimists

**Find interesting real-world problems and help solve them.**

Things can be better. We can build better.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-22-brightgreen.svg)
![Stack](https://img.shields.io/badge/stack-Cloudflare%20Workers%20%2B%20Astro-orange.svg)

A global community where people surface real-world challenges and technological
ideas, then work together to investigate, build, test and improve solutions.

The core object is a **Challenge**. It starts as a Problem, Idea, Experiment or
Build, and moves along one lifecycle:

```
Spot → Understand → Ideas → Build → Test → Learn → Improve
```

Fixing an irrigation system this afternoon counts. Documenting a fascinating
problem with no solution is a complete contribution.

---

## 🚀 Quick start

Node 22 (`.nvmrc`) and Python 3. No Cloudflare account, no secrets, no network
services — local work runs against a D1 database wrangler creates on demand.

```sh
npm install
make reset      # local D1: schema + 12 Challenges, 10 people, 10 updates
make dev        # API on :8791, site on :4321
```

Open http://127.0.0.1:8791. If that took more than a couple of minutes, it is a
bug in this file — open an issue saying where you got stuck.

## 🛠 Commands

`make` on its own lists every target. Every target delegates to an npm script, so
`npm run ship` and `make ship` do the same thing — use whichever you prefer.

| Command | What it does |
|---|---|
| `make dev` | 🔧 API on :8791 and the site on :4321, together |
| `make reset` | 🌱 rebuild local D1 and load the seed fixtures |
| `make check` | ✅ typecheck + tests — this is what CI would run |
| `make ship` | 🚢 typecheck, test, migrate additively, deploy prod, verify |
| `make ship-dev` | 🧪 same for the dev worker, seeds and all |
| `make verify` | 🔍 probe the live site end to end |
| `make logs` | 📡 tail prod |

Root build, database and deploy scripts serialize through a shared lock, so two
sessions in one checkout cannot run them at once. `npm run agents:status` shows
who holds it. A busy command exits with code 75 — retry after it finishes.

## 🗺 Layout

```
apps/web        Astro static site: index, Challenge, post, sign-in + React islands
apps/api        Hono API on Workers
packages/types  the vocabulary lock — Challenge types, stages, the 7 actions
packages/db     D1 schema + generated seed
docs/           concept, stack, constraints, dated notes
scripts/        seed generation, build orchestration, the operation lock
```

One Worker serves both: the assets binding handles pages, the Hono app handles
`/api/*`, `/media/*` and `/c/:slug`. Same origin, so the browser never needs a
base URL or CORS.

**Stack** — all Cloudflare, picked 2026-09-10. Astro 7 + React islands on the
front, Hono on Workers behind it, D1/R2/KV for data. Full table and the reasoning:
[`docs/2026-09-10-stack.md`](docs/2026-09-10-stack.md).

## 🤖 For agents

This repo is edited by Claude Code and Codex sessions, sometimes two at once.

- **[AGENTS.md](AGENTS.md)** is the entry point. It points at [CLAUDE.md](CLAUDE.md#agent-coordination),
  the canonical rulebook for every agent.
- **[CLAUDE.md](CLAUDE.md)** is the canonical rulebook — vocabulary, copy rules,
  coordination, how not to lose work. Read it in full before editing.
- Shared rules live in `CLAUDE.md` only. Do not copy them into tool-specific
  files or delegation prompts.
- Name your session so others can identify it: `AGENT_NAME=my-task make ship-dev`.

Three rules that get work sent back, worth knowing before the first edit:

1. **Vocabulary is load-bearing.** A Challenge is a Challenge — never a "post",
   "project" or "issue". The seven typed actions are not a generic Like.
2. **Copy rules.** Plain words, hyphen not em-dash. Never ship "this is a
   prototype" or "not built yet" into anything a user reads.
3. **Code is truth.** Never report status from a doc. Read the code, run the
   command, paste the artifact.

## 📚 Docs

Permanent files, one job each. Anything time-boxed is `docs/YYYY-MM-DD-slug.md`,
dated so staleness shows.

| File | Job |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 📏 Rules for whoever edits: vocabulary, copy, coordination |
| [`PRODUCT.md`](PRODUCT.md) | 💡 What is being built and why — the product argument |
| [`DESIGN.md`](DESIGN.md) | 🎨 Design language: foundations, screen patterns, layout contracts |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 🤝 How to send a patch, and what gets it sent back |
| [`docs/CONSTRAINTS.md`](docs/CONSTRAINTS.md) | ⚠️ Traps still live in the code — read before a deploy or schema change |
| [`docs/2026-09-10-concept.md`](docs/2026-09-10-concept.md) | 🌱 The raw brainstorm this came from |

## 🌐 Two environments

| | dev | prod |
|---|---|---|
| Address | `techno-optimists-dev.<your-subdomain>.workers.dev` | your domain |
| Data | throwaway, seeded | real, starts empty |
| Sign-in | returns `dev_link` in the response | mails the link, fails closed |

Binding **names** are identical in both, so no code branches on environment —
only the IDs behind them differ.

Production builds read the production API; development builds read local D1.
`ship` applies additive migrations before deploying and never resets existing
data. `schema.sql` is a destructive reset fixture for a new local database, not a
migration — it drops tables. See [`docs/CONSTRAINTS.md`](docs/CONSTRAINTS.md)
before touching the database, a deploy, the rate limiter, the CSP or the seeds.

## 🏗 Running your own instance

You do not need this to send a patch — nobody expects a contributor to deploy.

`wrangler.jsonc` is deliberately not in the repo: it carries an account id, D1 and
KV ids and a domain belonging to one Cloudflare account. Copy the templates and
fill in your own:

```sh
cp wrangler.jsonc.example wrangler.jsonc
cp wrangler.build.jsonc.example wrangler.build.jsonc
```

Every `<your-...>` placeholder needs a real value before a deploy. `wrangler d1
create` and `wrangler kv namespace create` print the ids; `wrangler whoami` prints
the account id.

Admins come from the `ADMIN_EMAILS` secret, comma-separated. Unset means nobody is
an admin — the site works and the import route stays closed. That is the correct
default for a fresh clone, not a bug. Secrets and the rest of the setup are in
[CONTRIBUTING.md](CONTRIBUTING.md#secrets).

## 🤝 Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Short version: `make check` passes, the
diff does one thing, and vocabulary and copy rules hold.

Security issues do not go in a public issue — use GitHub's private vulnerability
reporting. Details in [CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-security-issue).

## 📄 License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it commercially, no permission
needed. Copyright 2026 Techguyver Labs, LLC.

## Scheduled thread discovery on Cloudflare

The production Worker runs `apps/api/src/scout-cloudflare.ts` on the Cloudflare
Cron Trigger `17 */6 * * *` (00:17, 06:17, 12:17 and 18:17 UTC). Add the `AI`
binding, `SCOUT_ENABLED: "true"` and `triggers.crons` from `wrangler.jsonc.example`
to your ignored production config, then use `npm run deploy:prod`. No laptop,
Ollama service, session cookie, paid search key or additional database schema is
required. Cloudflare may take up to 15 minutes to propagate trigger changes.
Set `SCOUT_ENABLED: "false"` and deploy to pause ingestion.

The remote runner selects from the registry in `apps/api/src/scout-sources.ts`,
fetching up to 24 new articles and reviewing up to 8 readable articles per six-hour slot (96 fetches / 32 AI reviews per day, before the budget guard). Practical water, heat, farming, repair and infrastructure headlines get first consideration; other entries remain eligible. The initial registry includes
Nepali Times, Mongabay, Mongabay India, The Better India, Global Voices, Rest of
World, Hackaday and CleanTechnica. It classifies type, stage, reach and severity
with Workers AI Llama 3.3 70B (8,000 source characters maximum), requires a fresh publication date and an exact measurement quote (a paraphrased draft quote can be replaced with an exact 15-word excerpt containing its unchanged headline numbers),
and audits the full narrative in a separate inference. Uncertain drafts go to
private KV keys `scout:review:*`; transient failures retry after a day. The audit
is automated evidence checking, not independent fact verification. Status is
explicitly as reported on the source date; this feed-only path does not conduct
a wider web search for subsequent solutions. Use the local research CLI for that.

Accepted drafts are geocoded through Nominatim and use the publisher-supplied
RSS cover first, then the article Open Graph/Twitter cover. The selected image is
stored in R2 with its original URL and publisher credit; attribution also appears
in source provenance. Downloaded JPEG/PNG/WebP covers must pass host, size and
dimension checks. Only when neither supplied cover works does FLUX.1 Schnell
generate an illustration. Insertion uses the same append-only D1 helper as the CLI. Existing
threads and subsequent community edits are preserved. Source URLs and stable
place/problem slugs suppress duplicates; semantic duplicates can still need review.

Strongly consistent R2 conditional slot claims prevent overlapping/replayed runs
from multiplying the allowance. Each scheduled run has a 2,000-neuron guard shared
by drafting, auditing and fallback images. Text calls reserve conservatively from
UTF-8 input size and the output-token limit (800 draft, 300 audit), then settle
against reported token usage when available. Failed requests or missing usage keep
the full reservation; image generation reserves 58 neurons. The guard can stop a
run before eight reviews. Deferred articles stay unseen for a later attempt and
are excluded from source-quality evaluations. Rates are fixed in
`apps/api/src/scout-budget.ts` and need checking when Cloudflare changes pricing.

For an immediate operator batch, run `npm run scout:run:remote`. It uses the same
pipeline with real production bindings through an authenticated Wrangler session,
a localhost-only harness and the repository operation lock. It can publish data.
A separate permanent R2 claim allows **two manual runs per UTC day**, each with a
1,000-neuron allowance, without consuming the next scheduled slot. Set `SCOUT_SOURCE=better-india` to probe a particular enabled feed. Its JSON report
is saved under ignored `outputs/scout-manual/`. No manual-trigger route is exposed
on the deployed website. Scheduled and manual history keys cannot overwrite each other.

The scheduled allowance totals 8,000 neurons/day; including both optional manual runs
makes 10,000. This is a per-job accounting guard at current rates, not a guaranteed
$0 bill: Workers AI's free allocation is shared across the account, pricing can
change, and an existing paid account can incur combined-usage overages. This code
does not change billing plans or impose an account-wide billing cap.
See [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Check [live Scout status](https://technooptimists.org/api/scout/status) for the last
run's timestamps, counts and errors. Detailed run reports are private KV keys
`scout:run:*` (90 days), and Worker logs contain `scout_run` events. R2 slot claims
are tiny permanent records; keep them to preserve replay protection. New content
uses the site's existing dynamic thread routes, so each run needs no site deploy.

### Compare, rotate and retire sources

```sh
npm run scout:audit -- --days 30 --out outputs/scout-audit.md
npm run scout:audit -- --days 90 --json
```

The [source comparison API](https://technooptimists.org/api/scout/sources?days=30)
accepts 7, 30 or 90 days. It reports checked/readable articles, approved drafts,
publications, duplicate/seen skips, rejection categories, feed/fetch/model/delivery
errors, text/image calls, cover availability, supplied covers used and generated
images used. Approval yield excludes model failures from its denominator; it is
an automated acceptance metric, not a human quality rating. Publications may be
lower because delivery failed or a duplicate was found. A missing sample is shown
as unknown, never as 0% quality.

Cold starts rotate through the least recently tried feeds. Once a source has at
least 20 evaluated articles across 5 runs, ordinary turns favor its Wilson lower
confidence bound for approval yield. Every fourth turn explores a less recently
tried source; feeds left unvisited for 14 days also get a turn. Three consecutive
feed-level failures trigger a 72-hour cooldown before another probe. Model and
image failures do not trigger that source cooldown. Zero approvals after enough
evidence raises `review_for_replacement`; it does not silently remove a feed.

To add a source, add a stable ID, feed URL, publisher hosts and image CDN hosts in
`apps/api/src/scout-sources.ts`, test its feed/article/cover, and deploy. To pause
or retire it, set `enabled: false` and retain the entry and ID. Resume by setting
it true. History survives either change. Broader feed coverage does not increase
the per-run AI allowance.

Each completed attempt has a deterministic `scout:source-run:*` KV record with
**no expiration**, including source ID, counters, reasons, article outcomes,
publication slugs and selection strategy. Rewriting a run cannot double-count it.
The [run history API](https://technooptimists.org/api/scout/source-runs) returns
compact metrics with `next_cursor` pagination for audits beyond 90 days. Full
article-level records stay in private KV. Counters start with this source-tracking
version; older `scout:run:*` logs remain available for their original retention.

### Optional local runner


Run one bounded enrichment job from cron, a system timer, or a task runner:

```sh
npm ci --prefix scripts/scout
npm run scout:cron -- --write --env-file .env
```

The job reads news feeds and optional web searches, drafts threads, classifies
impact and severity, runs mechanical evidence checks plus a separate content audit,
generates local illustrations, uploads them to R2 through the API, and inserts
eligible threads. There is no approval-file step. Uncertain drafts are saved
for inspection and skipped; one unsuitable article does not stop the batch.
Omit `--write` for a complete discovery dry run with no database or image writes.

Configure `scripts/scout/cron.yaml`: API base, existing author handle, RSS feeds,
themes, places, source-page limit and publication limit. Defaults process up to 12
pages and publish at most 5 threads per run. Feeds work without a search key;
`BRAVE_SEARCH_API_KEY` adds rotating web queries. Sources and feeds come from trusted
operator configuration, never from model instructions. PDFs are queued as unsupported.

The runner needs Node 22.13+, Python 3, a running Ollama model (default
`qwen3.5:9b`), and the local image service on port 4750. `SCOUT_MODEL`,
`SCOUT_VERIFY_MODEL` and `SCOUT_MODEL_BASE` override model configuration. The audit
is a separate inference, not a claim of independent human verification. Automatic
publication requires matching source-date metadata from the past 90 days, an exact
short measurement quote, a resolved location, and all audit checks passing. Reports
are explicitly dated to their source; they do not claim the situation is unchanged
today. Impact rings measure reach; severity is retained separately in provenance.

Put `TO_SESSION` in a gitignored `.env`, using an existing admin session for the
configured API. The job checks it before discovery and fails with a nonzero exit
when missing, expired, or not an admin. Existing sessions expire after 60 days, so
this credential must be renewed. No new auth mechanism is provisioned by Scout.
The append-only API must be deployed before the job's first write; the runner
refuses a server that does not explicitly confirm `create_only` support.

For example, a scheduler can invoke the same command every six hours. Set its
working directory to this checkout and provide a PATH containing Node, npm and
Python, or use their absolute paths. The local runner does not install a machine schedule; production scheduling is handled by the Worker above.

The default durable state is `outputs/scout-job/state.json`. Keep it across runs
and use a separate state directory per database. Each run also saves its JSON
summary, rejected reasons and evidence under `outputs/scout-job/runs/`; latest
status is `outputs/scout-job/last-run.json`. These files are private and gitignored.
Failures retain queued cards and retry with exponential backoff. Published sources
are deduplicated against both saved state and the live feed. Stable place/problem
slugs plus an atomic insert-only database operation protect retries, concurrent
runs and community edits. Semantic duplicates with different descriptions can
still need editorial cleanup. The shared process lock returns exit code 75 when
another coordinated operation is running; the scheduler can retry later.

Images upload through `/api/uploads`, so new threads need no static asset deploy.
Set `images: false` for text-only ingestion. Failed image or API operations remain
pending rather than creating a thread with a broken image. Existing threads
are never overwritten by this job; it grows the database with new sourced material.

```sh
npm run test:scout
npm run scout:cron -- --help
```

For manual research, the original CLI remains available:
`npm run scout -- --sources-only --limit 9 --out outputs/scout`.
Its example sources are in `scripts/scout/themes.yaml`. Manual runs write
`cards.json`, `review_queue.json` and an optional approval template; the scheduled
job does not use that approval workflow.

Provider references: [Ollama chat](https://docs.ollama.com/api/chat),
[Brave web search](https://api-dashboard.search.brave.com/api-reference/web/search/get).
