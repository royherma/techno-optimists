# Contributing

Thanks for looking. This is a small codebase and a clone should be running in a couple
of minutes. If it is not, that is a bug in this file - open an issue saying where you
got stuck.

## What this is

A global community where people surface real-world challenges and work together on
them. The core object is a **Challenge**. Read [PRODUCT.md](PRODUCT.md) for the
argument and [`docs/2026-09-10-concept.md`](docs/2026-09-10-concept.md) for the raw
concept before proposing a feature - most product questions are already answered there.

## Ways to help

You do not need to write code. [Share a Challenge](https://technooptimists.org/post),
join a discussion, bring research or expertise, test an idea, or help with design,
writing and translation. [Open an issue](https://github.com/royherma/techno-optimists/issues)
for a bug or improvement, or email roy@techguyverlabs.org to discuss collaboration.
For security vulnerabilities, use the private reporting path below.

Code contributions are reviewed through pull requests under the repository's MIT
license. Contributing does not grant production database, deployment or admin access.
The code license does not automatically license members' content on the site.

## Run it locally

You need Node 22 (see `.nvmrc`) and Python 3. Python is not optional: the build,
database and deploy scripts go through `scripts/coordinate.py`, which holds a lock so
two people editing one checkout cannot run them at once.

```sh
npm install
npm run db:reset:local     # local D1: schema + seed Challenges
npm run build:web          # starts its own API on 8792, builds, stops it
npm run dev                # http://127.0.0.1:8791
```

`make` on its own lists every target. `make check` is typecheck + tests and is what CI
would run. Local work needs no Cloudflare account and no secrets.

## Deploying is not part of contributing

`wrangler.jsonc` is deliberately not in the repo - it carries an account id, D1 and KV
ids and a domain that belong to one Cloudflare account. `wrangler.jsonc.example` and
`wrangler.build.jsonc.example` are the templates if you want to run your own instance;
see "Running your own instance" in the [README](README.md).

You do not need any of this to send a patch. Nobody expects a contributor to deploy.

## Secrets

Never commit one. `.env` and `.dev.vars` are gitignored and `.env.example` lists every
variable with an empty value - add new ones there, empty, when you introduce them.

Admin access comes from the `ADMIN_EMAILS` secret, comma-separated. Unset means nobody
is an admin, which is what a fresh clone gets: the site works and the import route stays
closed. That is correct, not a bug to fix.

## Before you open a PR

- `make check` passes - `npm run typecheck` and `npm test`.
- Read [CLAUDE.md](CLAUDE.md). It is written for the people and agents editing this
  repo and it binds contributors too. The parts that will get a PR sent back:
  - **Vocabulary.** A Challenge is a Challenge, never a "post", "project" or "issue".
    The seven typed actions are not a generic Like. These words are load-bearing.
  - **Copy rules.** Plain words, hyphen not em-dash. Never ship "this is a prototype"
    or "not built yet" into anything a user reads - tell us in the PR instead.
  - **Docs.** Four permanent files, each with one job. Anything time-boxed is
    `docs/YYYY-MM-DD-slug.md`. Throwaway scripts do not belong in the repo.
- Read [`docs/CONSTRAINTS.md`](docs/CONSTRAINTS.md) if you touch the database, a
  deploy, the rate limiter, the CSP or the seed files. Every entry there is a trap that
  already cost someone real time.
- Keep the diff to one thing. A PR that fixes a bug and reformats a file is two PRs.

## Schema changes

`packages/db/schema.sql` is a destructive reset fixture for a new local database, not a
migration - it drops tables. Existing databases are changed only by an additive
migration (`scripts/migrate-community.mjs`). A PR that edits only the reset fixture
leaves every deployed database behind, which is the single easiest way to break this
project.

## Reporting a security issue

Do not open a public issue. Use GitHub's private vulnerability reporting on this repo
(Security -> Report a vulnerability) - it is enabled, so that is the whole path. Full
policy, including what is and is not a vulnerability here: [SECURITY.md](SECURITY.md).

## Working alongside agents

Parts of this codebase are written by Claude Code sessions, sometimes two at once.
[CLAUDE.md](CLAUDE.md#agent-coordination) describes the shared operation lock and the file-ownership rules.
You do not need it to send a patch, but it explains why the npm scripts wrap everything
in `coordinate.py` and why `git stash` is banned here.
