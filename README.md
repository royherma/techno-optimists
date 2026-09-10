# Techno Optimists

**Find interesting real-world problems and help solve them.**

Things can be better. We can build better.

## Status

Shell only. No app code yet. The concept lives in
[`docs/2026-09-10-concept.md`](docs/2026-09-10-concept.md) — read that first.

## What this is

A global community where people surface real-world challenges and technological ideas,
then work together to investigate, build, test, and improve solutions.

The core object is a **Challenge** — starts as a Problem, Idea, Experiment or Build,
and converges on one lifecycle: Spot -> Understand -> Ideas -> Build -> Test -> Learn -> Improve.

## Layout

```
apps/       runnable surfaces (web, worker) — empty until we pick the stack
packages/   shared code (types, ai, ui) — empty
docs/       concept, PRDs, decisions
scripts/    one-off and dev scripts
```

## Next

1. Pick the stack and scaffold `apps/web` (feed + challenge page, fake data).
2. Challenge data shape in `packages/types`.
3. AI ingest spike: media -> transcript -> structured Challenge draft.
