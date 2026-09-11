# Constraints

Traps that are still live in the code. Read this before touching the database, a
deploy, the rate limiter, the CSP, or the seed files.

Every row here was re-checked against the code on 2026-09-11. Historical decisions -
why the core object is a Challenge, why the index is drawn as a survey sheet, the
design reversals - are in `docs/2026-09-11-decisions-archive.md` and are not rules.

A row leaves this file when the code stops making it true, and moves to the archive.

## Generated art

**Challenge illustrations generate on the local $0 model. A paid image API needs
Roy saying so in the same breath.** `local-imagegen` (sibling folder) serves
`x/flux2-klein:4b` on pinned Ollama 0.32.5 at `localhost:4750` and costs nothing -
it runs on this machine. The first version of `scripts/gen-challenge-art.mjs`
reached for OpenRouter at $0.03362925 a call and built an elaborate 2x2-grid-and-slice
scheme to cut nine cards to ~$0.10, while the free generator sat one folder over.
That was real optimisation aimed at the wrong number: it made a paid call cheaper
instead of removing it. The script now defaults to local and requires an explicit
`--paid` to spend money, because a rule that lives only in a doc is one a future
session reads past. Two things invert on the local path and the script encodes both:
there is no per-call charge, so a grid amortises nothing and each card is drawn
singly; and the cost that remains is time, so it draws the card's own 4:3 (688x512,
~50s measured over 9) rather than a square that `object-cover` would crop.

**`/api/gen` returns saved file paths, not base64.** The response is
`{saved:[{path,...}], errors, requested}` and the server writes the PNG into
`local-imagegen/outputs/` itself. A probe that assumed an `image` string got
`top-level keys: saved, errors, requested` and no picture while the file sat on disk.
Read `saved[0].path`. Generation legitimately takes 40-90s at any resolution - a slow
response is not a hung one, and killing it mid-run leaves `shutting down mlx runner`
in `logs/serve.log`.

## Database

**Prod D1 has no migration path. A new column never reaches it.**
`db:prod` is `wrangler d1 execute techno-optimists --remote --file packages/db/schema.sql`
and `packages/db/schema.sql` is bare `CREATE TABLE`s. There is no `migrations/` dir.
`db:reset:dev` works only because it drops and rebuilds, which prod cannot do once it
holds accounts. When `identities.is_admin` was added to `schema.sql` and shipped, the
first real sign-in threw `no such column` on `INSERT INTO identities (...)` and Hono
answered a bare `Internal Server Error`. Fixed by hand:
`ALTER TABLE identities ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`.
Every new column needs the same manual `ALTER` against both remote databases until a
real `migrations/` dir exists. `schema.sql` describes a fresh database, never an
existing one.

**`ANALYTICS_DB` is bound but is not where traffic goes.** Use Analytics Engine
(`to_events`). `schema-analytics.sql` was never applied, so both `to-analytics` and
`to-analytics-dev` hold zero tables. Rebuilding it in D1 would be the wrong fix: D1 is
single-threaded per database and bills per row, so a write per pageview serialises
behind feed reads and burns the 100k/day free write quota. The binding is left in place
with a comment saying why it is not the one to use.

**`seed.sql` is generated. Never hand-edit it.** `db:seed:local` and `db:seed:dev` both
run `npm run seed:gen` first. When `gen-seed.mjs` gained `w`/`h` and nothing regenerated
its output, `db:reset:dev` faithfully reseeded the stale SQL and every media plate fell
back to a guessed ratio - the sizing work was live and inert at the same time.

## Deploys

**Prod ships empty - schema only, no seed.** The 12 seed Challenges
("well-pump-runs-dry", "milk-cooling-loss") are a dev fixture. They were in prod D1 once
already, from the aborted un-park.

**`deploy:prod` must keep using `build:web:only`.** That is the guard. `build:web` runs
`scripts/build-web.mjs`, which starts a local API on 8792 and prerenders from LOCAL D1;
pointed at prod that publishes local seed rows onto the domain. `build:web:only` is
`npm --workspace web run build` with `PUBLIC_API_BASE=https://technooptimists.org`, so it
reads the production API. Eight throwaway local rows ("...dry season 1353", "Testing
whether a fresh Challenge renders") once shipped to dev this way and returned 200.

**Deploying dev is two steps whenever the schema moved:** `db:reset:dev` then
`deploy:dev`. Skipping the reset is how live sign-in 500'd on `no such table:
magic_links` while every local test passed.

## Worker

**Sign-in rate limiting counts rows in `magic_links`. Not the Workers binding, not KV.**
5/hour per address, 20/hour per IP. The native binding cannot express an hour: `period`
is an enum of exactly `[10, 60]` seconds (`node_modules/wrangler/config-schema.json`), so
an attacker paces around it at one request every 61 seconds. KV caps at one write per
second per key, and a counter is one key, so the limiter becomes the bottleneck under
exactly the load it exists for. `magic_links` already stores `email`, `ip` and
`created_at`, so the count is two indexed `COUNT(*)`s over a table we write anyway.

**The Worker's CSP header must NOT restate `script-src`.** Astro's `security.csp`
generates the page CSP with per-build script hashes; island hydration ships three inline
`<script>` blocks with real bodies. When two policies apply each directive is
intersected, so a `script-src 'self'` in the header overrides Astro's hashes and breaks
hydration - in the one case that looks most like hardening. The header carries what a
`<meta>` CSP cannot: `frame-ancestors` is ignored inside `<meta>`, so clickjacking
protection lives only in the header.

**`dev_link` is returned only when `ENVIRONMENT !== 'prod'`.** The magic link is a bearer
token; returned unconditionally, POSTing a stranger's address hands over their account. A
missing mail key in prod must break sign-in loudly, never open a door.

**Email is stored in `identities`, never on `people`; `people.name` is returned by
`/api/auth/me` alone.** `SELECT p.*` then cannot leak an address, and `name` is derived
from the email local part at signup - a real name nobody chose to publish.
`PublicPerson = Omit<Person,'name'>` names the safe shape once.
