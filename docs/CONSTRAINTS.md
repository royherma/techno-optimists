# Constraints

Traps that are still live in the code. Read this before touching the database, a
deploy, the rate limiter, the CSP, or the seed files.

Every row here was re-checked against the code on 2026-09-11. Historical decisions -
why the core object is a Challenge, why the index is drawn as a survey sheet, the
design reversals - are in `docs/2026-09-11-decisions-archive.md` and are not rules.

A row leaves this file when the code stops making it true, and moves to the archive.

## Generated art

**The local illustration script defaults to the local $0 model. A paid image API needs
Roy saying so in the same breath.** The remote Scout uses Workers AI FLUX.1 Schnell with a hard per-slot inference cap, within the shared daily free allocation at its intended volume; it does not enable paid billing. See the remote Scout section in README for the account-wide quota caveat. `local-imagegen` (sibling folder) serves
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

**Never apply `schema.sql` to an existing production database.** It drops tables.
Use the coordinated `db:migrate:local`, `db:migrate:dev`, and `db:migrate:prod`
scripts. `scripts/migrate-community.mjs` checks for the optional emoji column before
adding it and applies the repeatable `packages/db/community.sql` table additions.
`ship` and `ship:dev` run these migrations before deployment. Future schema changes
must extend an additive migration; merely editing the reset fixture leaves existing
databases behind. The original `identities.is_admin` incident is in the dated archive.

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

**Deployment needs a checkout-local `wrangler.jsonc`.** The real config is ignored
and is not copied into new worktrees. Without it, Wrangler discovers the parent
checkout's config and uploads that checkout's `apps/web/dist`, even though Astro
built the worktree. On 2026-09-11 this uploaded zero assets and briefly served
404s; rebuilding and deploying from the main checkout restored the site. Before
deploying a worktree, provide its own config with the intended bindings and verify
the asset directory printed by Wrangler matches the build output.

**Prod ships empty - schema only, no seed.** The 12 seed Challenges
("well-pump-runs-dry", "milk-cooling-loss") are a dev fixture. They were in prod D1 once
already, from the aborted un-park.

**`deploy:prod` must keep using `build:web:only`.** That is the guard. `build:web` runs
`scripts/build-web.mjs`, which starts a local API on 8792 and prerenders from LOCAL D1;
pointed at prod that publishes local seed rows onto the domain. `build:web:only` is
`npm --workspace web run build` with `PUBLIC_API_BASE=https://technooptimists.org`, so it
reads the production API. Eight throwaway local rows ("...dry season 1353", "Testing
whether a fresh Challenge renders") once shipped to dev this way and returned 200.

**Deploy schema and code together:** use `ship:dev` or `ship`. Direct `deploy:*`
commands do not migrate the database. Reset scripts are only for explicitly
throwaway databases.

## Worker

**Uploaded media must run through the Worker.** Keep `/media/*` in
`assets.run_worker_first` in every environment, alongside `/api/*` and `/c/*`.
The static asset handler otherwise returns a 404 for uploaded R2 files even
though the upload succeeded. Check a real uploaded image in a browser after
changing this routing, including opening it in a new tab.

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

**Admins come from the `ADMIN_EMAILS` secret. Unset demotes everyone, silently.**
`apps/api/src/admin.ts` reads a comma-separated secret; `identities.is_admin` only
caches it, and `currentPerson` rewrites the column to agree on every request. So a
Worker deployed without the secret does not fall back to the cached column - it
strips admin from every account on their next page load, and `/api/challenges/import`
starts answering 403 to the person who owns the site. The addresses used to be an
array in source, which is why this trap is new: an edit could not be forgotten, a
`wrangler secret put` on a new environment can. Set it on **every** environment you
deploy, before the first sign-in: `wrangler secret put ADMIN_EMAILS --env <env>`.
`wrangler secret list --env <env>` is the check. Locally it goes in `.dev.vars`.

**The two routers disagree about Origin, and only `community` checks it.**
`apps/api/src/community.ts:32-40` rejects any non-GET whose `Origin` header does not
match the request URL (403 `bad_origin`) and any without a JSON content-type (415).
`grep -n 'Origin\|bad_origin' apps/api/src/index.ts` returns nothing, so the eight
mutating routes there - `POST /api/challenges`, `/challenges/import`, `/:slug/updates`,
`/:slug/action`, `PUT /api/uploads`, `/auth/request`, `PATCH /api/people/me`,
`POST /auth/signout` - rest on `SameSite=Lax` alone (`apps/api/src/auth.ts:116`). Lax
does block a cross-site POST, so this is defense in depth and an inconsistency, not a
hole. Deliberately deferred past the launch announcement - Roy's call, 2026-09-11 - and
left here so the asymmetry is not mistaken for a decision. Porting the check is six
lines; porting the content-type gate with it is what risks 415ing a caller that works
today, so weigh those separately.

**Email is stored in `identities`, never on `people`; `people.name` is returned by
`/api/auth/me` alone.** `SELECT p.*` then cannot leak an address, and `name` is derived
from the email local part at signup - a real name nobody chose to publish.
`PublicPerson = Omit<Person,'name'>` names the safe shape once.

**Both editions need Worker fallback routing.** Keep `/c/*`, `/v1/*` and `/v2/*` in `assets.run_worker_first` alongside `/api/*` and `/media/*`. The shared Challenge handler serves `/c/_shell` (or `/v1/c/_shell`) for Challenges created after a build; unknown Classic URLs serve `/v1/404` with status 404, and `/v2/*` 301s to the same path without the prefix. Without the routing entries, newly posted Challenges stop at the asset handler and the retired `/v2` links stop redirecting.

**The newspaper is served at `/`, never by a redirect.** Base.astro used to run a client-side `location.replace` sending every bare path to its `/v2` twin, so the address bar never kept the URL anyone typed. `scripts/test-edition.mjs` asserts no `location.replace` survives in that layout. If a design switch is ever needed again, it is a path or a server response - not a redirect after first paint.
