# techno-optimists

Public repo, Apache-2.0. Own git repo inside `techguyver-side-projects` — **not** a
monorepo member. Outside contributors read [CONTRIBUTING.md](CONTRIBUTING.md); this file
is the rules for whoever edits, and applies to them too.

## Read first

`docs/2026-09-10-concept.md` is the source of truth for what this product is.
Do not restate or re-derive it — link to it.

## Vocabulary (use these exact words)

- **Challenge** — the core object. Not "post", not "project", not "issue".
- A Challenge starts as one of: **Problem**, **Idea**, **Experiment**, **Build**.
- Lifecycle: Spot -> Understand -> Ideas -> Build -> Test -> Learn -> Improve.
- People roles: **Scout**, **Thinker**, **Researcher**, **Builder**, **Expert**, **Tester**.
- Social actions are typed, never a generic Like:
  I have this problem / I want this / I have an idea / I can help / I'll test this /
  I'm building this / Follow progress.

## Product rules

- The feed comes before collaboration. Browsing must be enjoyable before contributing is asked.
- AI is invisible plumbing (transcribe, translate, structure, match). Never an "AI community".
- Not startup-focused, not charity-focused, not future-focused. Fixing an irrigation
  system this afternoon counts.
- Documenting a fascinating problem with no solution is a complete contribution.

## Copy rules

- Never ship "this is a prototype" / "not built yet" into user-facing copy. That goes to Roy.
- Plain words, hyphen not em-dash.

## Two deploy targets

`technooptimists.org` was bought 2026-09-10 and prod is live on it. The lock that
stood here until then is lifted - Roy's call, same day.

**Prelaunch: deploy without asking.** There are no real users yet, so a broken
deploy costs a redeploy and nothing else. Iterate fast: build, deploy, verify,
keep going. Do not stop to ask permission for `deploy:dev` or `deploy:prod`, and
do not ask whether to check something - check it. This overrides the global
deploy gate for this repo, and it expires the day real Challenges exist.

**Push to prod generously.** Default is ship, not ask. A non-critical change goes
straight to prod the moment it builds and verifies - copy, styling, layout, a new
page, a bug fix, a content or seed-free data tweak. Do not queue these behind a
question. Two standing authorizations, both permanent: Roy said yes once to a kind
of change, that yes covers the next one of the same kind; and if Roy asked for the
thing, the deploy that makes it real was part of the ask - shipping it is not a
second decision.

Still ask first, only for these: a schema change or migration on prod D1, anything
touching auth, billing, secrets or DNS, deleting prod data, and a rollback of
someone else's live change. That list is the whole definition of "critical" - if a
change is not on it, ship it.

Speed is about the asking, never about the checking. Verify after every prod deploy
and paste the artifact. A deploy you did not verify is not a fast deploy, it is an
unknown one, and "it built" is not verification.

- `npm run deploy:dev` -> `techno-optimists-dev.<subdomain>.workers.dev`, throwaway data.
- `npm run deploy:prod` -> `technooptimists.org`, real data. The apex and `www` are
  custom domains declared in `wrangler.jsonc`, so the deploy creates their DNS records.
- `workers_dev` is **false** in prod. One public address, so no second URL gets
  bookmarked. Do not turn it back on to "check something" - use dev for that.
- **Production builds read the production API.** `deploy:prod` sets
  `PUBLIC_API_BASE=https://technooptimists.org` and uses the locked `build:web:only`
  entry point. Development builds still use local D1. Never replace this with
  `build:web` in the production pipeline: that would publish local seed rows.
- Prod D1 starts empty on purpose: 7 tables, zero rows. Seeds are a dev fixture and
  never belong on the domain.

## Code is truth

The code is the only source of truth about what exists. This file, the README and every
doc go stale the moment a commit lands; they describe intent, never state.

- Never report status from a doc. Read the code, run the command, paste the artifact.
- Never say a thing is missing without the grep that found nothing.
- Found a doc that contradicts the code? The doc is wrong. Fix it in the same commit.
- No status or progress sections in this file. `git log` and the code already say it.

## Never lose work

Two people edit this repo at once. An untracked file is one parallel `git checkout`
away from gone with no recovery - only a commit survives, via the reflog.

- Commit the moment a change compiles, not when it feels done: `git add -A &&
  git commit -m "wip: <what>"`. `wip:` is a normal state here, not an apology.
- Push after committing. The push is the only off-machine backup.
- `git status` before every build, deploy, checkout or branch switch. Files you did
  not touch showing as modified means the other session is live - commit first,
  investigate second.
- Never `git stash`, `reset --hard`, `checkout -- .` or `clean -fd` on a dirty tree.
  A wip commit is the stash.
- Untracked `??` files are someone's work in progress, never junk. Commit them or
  gitignore them - do not delete. Safe to ignore without asking: `*.swp`,
  `.DS_Store`, build output, `*-tmp.mjs` probes.
- Committing someone else's in-flight files is correct when they compile. Say plainly
  in the message that it is a safety commit, not a claim the feature is finished.

Full protocol: `~/.claude/reference/rules/never-lose-work.md`.

## Docs

Four permanent files, one job each. Everything else is dated or throwaway. If a new
document does not fit a slot below, it does not belong in the repo - which is the
point: no dangling markdown.

| File | Job |
|---|---|
| `CLAUDE.md` | Rules for whoever edits: vocabulary, copy rules, how not to lose work |
| `README.md` | How to run it, and where the other docs are |
| `PRODUCT.md` | What is being built and why - the product argument |
| `docs/CONSTRAINTS.md` | Traps that are still live in the code - read before a deploy or a schema change |

- `CONSTRAINTS.md` holds only what is still true of the code: the manual prod ALTER, the
  unusable rate-limit binding, the CSP split, the generated seed. Each entry names the
  failure it prevents, so it is short enough to read every time. A rule whose trap the
  code no longer has is moved out, not kept "for history".
- History lives in `docs/2026-09-11-decisions-archive.md` and is not a rule. Do not
  consult it for how the system behaves - read the code.
- Anything time-boxed - a PRD, a spike writeup, a stack evaluation - is
  `docs/YYYY-MM-DD-slug.md`. The date is the staleness warning.
- Throwaway probes and scripts go in the session scratchpad, never the repo. `*-tmp.mjs`
  is gitignored for the ones that land here anyway.
- No status, progress or roadmap sections in any of them. See "Code is truth" above.

## Conventions

- Docs: `docs/YYYY-MM-DD-slug.md`.
- Secrets: `.env` / `.dev.vars`, both gitignored. Templates are `.env.example`.
- Node version pinned in `.nvmrc`.

## Agent coordination

Read [AGENTS.md](AGENTS.md) for the simultaneous-work protocol. `npm run agents:status`
shows the shared operation lock. Root npm build, database and deployment commands
acquire it automatically; `ship` keeps it through verification. Use those entry
points in every agent. Python 3 is required for the macOS/Linux OS lock.

The lock serializes processes; it does not protect source files. Editing a path another
session is in, and `git checkout`/`restore`/`stash`/`clean` on someone else's dirty
tree, are how work actually gets destroyed here - see "The lock does not protect source
files" in AGENTS.md, plus "Never lose work" above. Worktrees go in `.worktrees/`, never
`/tmp`, which macOS reaps.
