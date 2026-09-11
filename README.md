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

- **[AGENTS.md](AGENTS.md)** is the entry point. It points at `CLAUDE.md`.
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
