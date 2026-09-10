# techno-optimists

Private repo. Own git repo inside `techguyver-side-projects` — **not** a monorepo member.

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

## Conventions

- Docs: `docs/YYYY-MM-DD-slug.md`.
- Secrets: `.env` / `.dev.vars`, both gitignored. Templates are `.env.example`.
- Node version pinned in `.nvmrc`.
