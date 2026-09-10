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

## Stack

Picked 2026-09-10 - all Cloudflare. Astro 7 + React islands on the front, Hono on Workers
behind it, D1/R2/KV for data. Full table + why: [`docs/2026-09-10-stack.md`](docs/2026-09-10-stack.md).

## Next

1. Scaffold `apps/web` (feed + Challenge page, fake data).
2. Challenge data shape in `packages/types`.
3. AI ingest spike: media -> transcript -> structured Challenge draft.
