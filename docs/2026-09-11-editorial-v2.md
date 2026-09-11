# Editorial V2

Roy's references: [first](design/2026-09-11-editorial-v2/reference-1.png), [second](design/2026-09-11-editorial-v2/reference-2.png), [latest](design/2026-09-11-editorial-v2/reference-3.png). Original resolution. They guide visual hierarchy, density and detail; their sample metrics are not product data.

## The newspaper

Warm paper, black Georgia masthead, fine rules, generous lead headline, image above the lead story, two stacked secondary stories, and a three-column briefs strip when space permits. Keep the smaller editorial details: type and place, typed participation counts, contour marks, source attribution, map, colophon. Keep the right legend visible on laptops; small screens get a dedicated Legend view, not a missing legend. Do not copy the reference's geographic labels onto participation ranks: the rings represent relative contributions, not measured real-world impact.

## One view, one screen

Six stories on large desktop editions, three on laptops, one on phones. Previous and next editions replace the infinite feed. Details have Story, Context, Discussion, Progress, People, Participate and Source sections. Reading uses real browser column fragmentation and explicit page turns, retaining all content and preserving native text selection. Controls stay mounted when turning pages; focus and form validation turn to the relevant page. Discussion separates reading from writing, and posting uses Notice, Describe, Place and Review steps.

The frame fits the viewport, with no document or inner scrolling required to browse or read. Textareas retain native editing behavior. Exception: windows shorter than the 400px minimum retain natural overflow to avoid making controls impossible to operate.

## Routing and switching

All screens live under `/v2`: `/v2/c/<slug>`, `/v2/map`, `/v2/people`, `/v2/settings`, `/v2/post`, `/v2/signin`, `/v2/contribute`, `/v2/privacy`, `/v2/terms`. Existing pages also accept `?v=2`. A tab remembers the edition, including after sign-in and programmatic redirects. Classic returns to the same screen with `?v=1`. Query parameters and profile handles are preserved. Canonical links point to the unversioned content.

V2 Challenge routes share the existing Worker fallback for newly published Challenges. `/v2/*` belongs in `assets.run_worker_first` in each target; missing V2 pages return the newspaper recovery screen with status 404. The example config records this requirement.

## Component boundaries

- `NewspaperShell.astro`: masthead, navigation, layout, edition links and colophon.
- `Legend.tsx`: rings, lifecycle meanings, action vocabulary and supporting world overview.
- `FrontPage.tsx`, `StoryTile.tsx`, `useFeed.ts`: feed state, composition and reusable story tile.
- `ChallengePage.tsx`: Challenge loading and section selection; shared Discussion, Progress, ActionBar, PeopleLive and Editorial retain the existing APIs and permission checks.
- `PagedContent.tsx`: reusable page fragmentation, measurement and keyboard focus handling.
- Map, account, sign-in, submission, community and article adapters each have their own file.
- `src/content/*.html`: one checked-in source for both editions' legal and contribution articles.
- Styles split into newspaper shell and content compositions. Classic styles remain scoped to their existing pages.

Use `node scripts/preview-editorial.mjs` after a production-API build for a read-only local preview. Use the normal local Worker for form tests. Do not publish test Challenges to production.
