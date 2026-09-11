# Design QA — 2026-09-11

final result: passed

## Source and evidence

- Source: `docs/design/2026-09-11-reference/target.png` (2740×1570 original; visually normalized to 2048×1173).
- Implementation: `docs/design/2026-09-11-reference/empty-desktop.png` (2048×1173 CSS viewport and pixels, 1× capture). The source and rendered page were opened together in one comparison call, followed by a recapture after the legend sizing correction.
- State: empty results, signed out, search panel closed. The implementation has a truthful zero-results line because development contains 12 sample Challenges; the reference has an empty database. This one-line offset is intentional.
- Additional browser evidence: `desktop-laptop.png`, `desktop-1024.png`, `index-mobile.png`, `detail-desktop.png`, `detail-mobile.png`, `signin-desktop.png`, `post-desktop.png`, `settings-desktop.png`, `map-desktop.png`, all in the same directory.
- Viewports inspected: 2048×1173, 1440×900, 1366×768, 1024×768, 390×844.

## Findings and corrections

1. P1, first desktop pass: oversized landscape pushed the discovery links and philosophy below the reference frame. Generated a shallower composition, bounded its presentation, and verified the complete sun and figure remain visible.
2. P2, first desktop pass: navigation and legend text were too small. Increased wide-screen typography, retained compact laptop rules, and compared the final reference-width capture.
3. P2, mobile pass: type tabs shared a wrapping row with account controls. Changed mobile toolbar to a two-column grid with a dedicated full-width filter row. Verified all five filters and both account actions fit at 390px without horizontal overflow.
4. P2, mobile detail pass: the impact graphic narrowed the entire title/summary column. Rebuilt the detail header so only metadata reserves room for impact; title and summary use full mobile width.
5. P1, desktop interaction requirement: page-level scrolling hid the rail and legend. Changed the index to a viewport frame with one keyboard-focusable scrolling center pane. At 1024×768, page scroll remained 0 while the Challenge pane scrolled 477.5px. Last legend action bottom: 723.7px. At 1440×900 all legend actions fit; at 2048×1173 the last action ends at 1130.7px.
6. P2, narrow desktop with search expanded: search consumed legend height. Search now overlays the center pane on desktop; the complete legend remains visible with search open or closed.
7. P2, typography: existing Tailwind classes emitted literal token names as font families. Corrected variable syntax across the Astro and React components. Browser computed styles now report Libre Caslon Display for feed headings and system sans for controls.
8. P2, stage column: the long stage name could clip at laptop width. Applied compact sans stage labels. No horizontal overflow in the center pane at 1024px.

## Required fidelity surfaces

- Typography: bold serif masthead, editorial serif headings, sans navigation/controls; browser font-family verified. Long mobile headings wrap without clipping.
- Layout: soft framed toolbar, rail, table, right legend, illustrated empty state, three discovery links and closing philosophy match the target composition. The desktop center alone scrolls. Forms and details reuse the same shell, spacing and corner vocabulary.
- Color/tokens: nearly white cool canvas, white regions, navy ink, pale blue navigation, mint/lilac discovery links, preserved seven-stage semantics. Body and helper text use darker shared ink tokens; focus rings remain visible.
- Assets: actual generated raster landscape and orb, Phosphor icons with license, existing contour data graphics. No broken images observed. Detailed regions were inspected in the large 2048px capture and separate mobile captures; labels, icon shapes, stage rows and card text were readable there.
- Content: real API-backed sample Challenges in development; no invented People or Impact destinations. Existing Challenge vocabulary and typed contribution actions remain.

## Interaction verification

- Idea filter shows exactly two Idea rows; searching for “plastic” narrows to one correct result.
- Zero results displays the illustrated empty state; clearing restores rows.
- Type filters update the URL and current navigation state.
- Center-pane keyboard scrolling preserves page and legend position.
- Detail navigation, lifecycle, progress, contributors and media render.
- Local development sign-in with a disposable `.invalid` account reached its local callback without sending mail.
- Authenticated posting form rendered; selecting Idea set `aria-pressed=true`; empty submission remained disabled.
- Account form rendered; Builder role selection set `aria-pressed=true`. No Challenge submitted and no account edits saved.
- Map navigation and recovery-page links render and point to existing destinations.
- Mobile index/detail have 390px page width at a 390px viewport, with no broken images.
- Browser error log check returned no errors during normal flows. Recovery route was tested intentionally.

## Expected differences and remaining polish

- The reference's standalone People and Impact links do not have existing product destinations. The rail uses working Map and Challenge-type links; people and impact are represented on details and in the legend. Documented in DESIGN.md.
- P3: generated mountain contours and orb texture vary from the supplied raster. Subject, palette, composition and white fade are retained.
- Existing sample Challenge media are retained; this task does not replace the fictional fixture illustrations.
- Uploading a real file, sending production email and publishing a new Challenge were not part of this visual verification.
