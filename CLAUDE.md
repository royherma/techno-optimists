# techno-optimists

Public repo, MIT. Own git repo inside `techguyver-side-projects` — **not** a
monorepo member. Outside contributors read [CONTRIBUTING.md](CONTRIBUTING.md); this file
is the rules for whoever edits, and applies to them too.

## Shared instructions

This is the canonical project rulebook for Claude Code, Codex, and delegated
agents. `AGENTS.md` is only an entry point that directs agents here. Edit shared
rules here once; do not copy them into tool-specific files or delegation prompts.
When delegating, provide the checkout, task, owned paths, and validation commands,
and require the agent to read this file before working. Do not assume the other
agent system shares your conversation, memory, or permissions.

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

Follow the source-file and worktree rules under "Agent coordination" below.
Commit changes as soon as they validate; `wip:` is a normal state here. Stage
explicit paths so unrelated in-flight edits are not accidentally included.
Push after committing for an off-machine backup. A safety commit of another
session's work must be labeled as such and must not claim the feature is finished.
Untracked files are work in progress: preserve them. Safe ignores include `*.swp`,
`.DS_Store`, build output, and `*-tmp.mjs` probes.

## Docs

Four permanent reference files, one job each; `AGENTS.md` is an entry-point adapter.
Everything else is dated or throwaway. If a new document does not fit a slot below, it does not belong in the repo - which is the
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

These rules apply equally to Claude Code, Codex, and their delegated agents.
Python 3 is required for the shared macOS/Linux operation lock.

### Simultaneous work

- Run `npm run agents:status` and `git status --short` when starting and before shipping.
- Use separate Git worktrees for independent edits. Agree on file ownership when sharing a checkout; an operation lock does not protect source edits.
- Use the root npm scripts or Make targets for builds, database mutations and deployment. They acquire one shared lock across this repository's local worktrees, covering the full `ship` pipeline through verification. Dev and prod share a lock because builds use the same port and mutable local inputs.
- A busy operation exits with code 75 and prints its owner, task, checkout and start time. Continue independent editing or retry after it finishes. Never bypass with direct Wrangler, workspace builds, or manual database commands.
- Name your session with `AGENT_NAME=my-task npm run ship:dev` so others can identify it.
- Locks release when the holding processes close their descriptors. Do not delete lock files or kill another agent's process to take over. Investigate the owner and its child processes if an operation appears stuck.
- Prefer `npm run ship` / `npm run ship:dev` to hold the lock across preparation, deployment and verification. Separate invocations release the lock between steps.
- This coordinates cooperating agents on this machine sharing a Git common directory. Separate clones, other machines, direct CLI calls and CI are outside its protection. Those must use one designated deployment owner until a shared remote deployment queue exists.

### The lock does not protect source files

`coordinate.py` is an flock around build, database and deploy commands. It serializes
processes. It does not watch the filesystem, so every way one agent destroys another's
work is outside it: an editor write, `git checkout`, `rm`, a `>` redirect. Holding the
lock is not permission to touch a file someone else is in.

- Before editing, building, deploying, or switching branches, run `git status --short`. A path dirty that you did not touch belongs to
  the other session - commit it (`wip:`, say it is a safety commit) or leave it alone.
  Never revert it to "clean up" first.
- Re-read a file immediately before editing it if more than a couple of minutes passed.
  An mtime that moved since you read it means someone is in that file right now; your
  old copy would overwrite their lines with no diff to show what went missing.
- Never `git checkout <path>`, `git restore`, `reset --hard` or `clean` to undo your own
  edits. They take the other session's uncommitted lines with them and the reflog holds
  nothing that was never committed. A `wip:` commit is the only reversible undo here.
- Never delete or truncate a file you have not read this session, and never `>` over one.
- `git stash` is banned even when your own diff looks trivial. A stash is invisible to
  the other agent, survives no checkout it was not made in, and the one in this repo had
  to be read line by line to prove it held nothing but regenerated timestamps.

### Worktrees live in .worktrees/

`git worktree list` is the first thing to run when a second agent appears - it says
whether you share a checkout or not.

- Create them at `.worktrees/<task>` inside this repo. Never in
  `/private/tmp` or `/tmp`: macOS reaps those, and a reaped worktree takes every
  uncommitted line in it with no reflog entry, because the objects were never written.
- A `.git` **file** (not directory) marks a registered worktree. Never `rm -rf` one -
  `git worktree remove` so the registration goes with it.
- Commit and push before leaving a worktree. The push is the only copy that survives the
  directory.
