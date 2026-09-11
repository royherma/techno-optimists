# Editorial V2

Roy's references: [first](design/2026-09-11-editorial-v2/reference-1.png), [second](design/2026-09-11-editorial-v2/reference-2.png), [latest](design/2026-09-11-editorial-v2/reference-3.png). Original resolution. They guide visual hierarchy, density and detail; their sample metrics are not product data.

## The newspaper

Warm paper, black Georgia masthead, fine rules, generous lead headline, the complete image beside the lead story, and a two-column grid of secondary Challenges when space permits. Keep the smaller editorial details: type and place, typed participation counts, contour marks, source attribution, map, colophon. Keep the right legend visible on laptops; small screens get a dedicated Legend view, not a missing legend. The impact legend uses the original Local, Neighbourhood, Town, Region and Critical tiers. Rings expand outward. Reactions and updates must never be converted into impact: the current data model has no explicit impact field, so actual Challenges remain unmarked and detail pages say impact is not specified.

## One view, one screen

Five Challenges on large desktop views, three on laptops, one on phones. The actual content frame is measured with ResizeObserver; typography scales to each card height. Images use contain, and summaries truncate at whole lines. Previous and More Challenges replace the infinite feed, with a visible result range. Challenge details show story, discussion, progress, people, help and source panels simultaneously. No section tabs or collapsed panels. Each panel pages independently in place; writing opens a focused editor while the newspaper remains mounted underneath. Reading uses real browser column fragmentation and explicit page turns, retaining all content and preserving native text selection. Controls stay mounted when turning pages; focus and form validation turn to the relevant page. Discussion keeps the response list visible while the editor opens, and posting uses Notice, Describe, Place and Review steps.

The frame fits the viewport, with no document or inner scrolling required to browse or read. Textareas retain native editing behavior. Exception: windows shorter than the 400px minimum retain natural overflow to avoid making controls impossible to operate.

## Routing and switching

All screens live under `/v2`: `/v2/c/<slug>`, `/v2/map`, `/v2/people`, `/v2/settings`, `/v2/post`, `/v2/signin`, `/v2/contribute`, `/v2/privacy`, `/v2/terms`. Existing pages also accept `?v=2`. A tab remembers the edition, including after sign-in and programmatic redirects. Classic returns to the same screen with `?v=1`. Query parameters and profile handles are preserved. Canonical links point to the unversioned content.

V2 Challenge routes share the existing Worker fallback for newly published Challenges. `/v2/*` belongs in `assets.run_worker_first` in each target; missing V2 pages return the newspaper recovery screen with status 404. The example config records this requirement.

## Component boundaries

- `NewspaperShell.astro`: masthead, navigation, layout, edition links and colophon.
- `Legend.tsx`: rings, lifecycle meanings, action vocabulary and supporting world overview.
- `FrontPage.tsx`, `StoryTile.tsx`, `useFeed.ts`: feed state, composition and reusable story tile.
- `ChallengePage.tsx`: Challenge loading and permanent panel composition; shared Discussion, Progress, ActionBar, PeopleLive and Editorial retain the existing APIs and permission checks.
- `PanelDialog.tsx`: native dialog editing with draft preservation and page controls.
- `PagedContent.tsx`: reusable page fragmentation, measurement and keyboard focus handling.
- Map, account, sign-in, submission, community and article adapters each have their own file.
- `src/content/*.html`: one checked-in source for both editions' legal and contribution articles.
- Styles split into newspaper shell and content compositions. Classic styles remain scoped to their existing pages.

Use `node scripts/preview-editorial.mjs` after a production-API build for a read-only local preview. Use the normal local Worker for form tests. Do not publish test Challenges to production.
