## What this changes

<!-- One thing. A PR that fixes a bug and reformats a file is two PRs. -->

## Why

<!-- What problem this solves. Link an issue if there is one. -->

## How it was verified

<!-- The command you ran and what it printed. "It should work" is not verification. -->

---

- [ ] `make check` passes (typecheck + tests)
- [ ] Vocabulary holds: a Challenge is a **Challenge**, never a "post", "project"
      or "issue". The seven typed actions are not a generic Like.
- [ ] Copy rules: plain words, hyphen not em-dash. No "this is a prototype" or
      "not built yet" in anything a user reads - tell us here instead.
- [ ] Read [`docs/CONSTRAINTS.md`](https://github.com/royherma/techno-optimists/blob/main/docs/CONSTRAINTS.md)
      if this touches the database, a deploy, the rate limiter, the CSP or the
      seed files.
- [ ] Schema change? It is an additive migration, not an edit to the
      `schema.sql` reset fixture.

<!-- Anything unbuilt or half-done goes here, not into user-facing copy. -->
