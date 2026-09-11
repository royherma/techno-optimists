# Design language

The homepage is the visual reference for the whole product. Use Roy’s [selected design](docs/design/2026-09-11-reference/target.png), saved at original resolution, and the [reference brief](docs/2026-09-11-design-reference.md). The goal is a welcoming editorial index of real-world Challenges.

## Foundations

- White surfaces on a nearly white, subtly cool canvas. Fine quiet dividers replace black survey-sheet borders. No graph-paper background.
- Navy ink for hierarchy and primary actions. Pale blue for current navigation and contribution surfaces; mint and lilac identify the two other discovery links. The seven lifecycle colors retain their meaning.
- Bold Georgia for the large desktop masthead; Libre Caslon Display for editorial headings and short philosophy lines. System sans for labels, navigation, controls, metadata and readable body copy. No display serif on controls.
- Main regions use 12–16px corners. Buttons use pill shapes; inputs use 8–10px corners. Avoid decorative drop shadows.
- Phosphor regular icons, with pastel circular backgrounds where the reference uses them. Preserve their source license. Contour rings are product data graphics, not decoration.
- Watercolor mountains and a peach/blue sphere provide optimism without competing with content. Keep the full sun and figure visible; never stretch the artwork.

## Shared architecture

`Sheet`, `TitleBlock`, `SideNav`, `PageToolbar`, `SessionNav`, and `Icon` own the shell. `global.css` owns semantic tokens; `shell.css` owns the masthead/navigation. Each surface has a separate stylesheet. `FormPage` owns common form structure. Challenge details are composed from `ChallengeHeader`, `Lifecycle`, `ProgressLog`, and `PeoplePanel`.

Keep routes focused on data loading and composition. Prefer reusing a component over copying a whole page. Preserve live Challenge markers, client islands, forms, auth redirects, real API data and typed social actions.

## Screen patterns

- **Index:** index/map switch, type tabs, expandable search, quiet five-column table, legend on the right. Empty state: shallow panorama, large serif heading, three practical discovery links, philosophy line. Live additions obey the same filters and empty-state rules.
- **Challenge:** breadcrumb toolbar, title and human attribution, contour impact, seven-stage progression, media/story/progress in the reading column, participation and people in the supporting column. Describe facts; never invent progress or contributors. Missing updates receive a calm explanatory state.
- **Map:** the same toolbar, editorial heading and caption, soft map frame, semantic pins and readable Challenge links.
- **Post/account/sign-in:** shared icon-led header, comfortable reading width, labeled inputs, obvious selected options, navy primary action, visible focus and error states. Posting and account actions retain their sign-in gates.
- **Not found:** the same shell and form-scale content, clear recovery link and real recent Challenges.

## Responsive behavior and states

The rail becomes a five-item bottom navigation on phones. Preserve safe-area spacing. The legend becomes an expandable disclosure; type filters remain in their own row. Challenge media and supporting content stack, the lifecycle wraps, and headings use the full available width. Test 390px, 1024px and reference-width desktop layouts without horizontal overflow.

Hover/focus responses are short (120ms); respect reduced motion. Active navigation uses pale blue plus text/icon emphasis. Selected form controls use both a stronger border and a tinted background. Keep text readable on every tint; primary-action color does not substitute for text labels.

## Intentional scope

The reference’s People and Impact destinations are not existing standalone screens. The rail links to working Home, Map, Ideas, Experiments and Build destinations. People and impact remain first-class content in Challenge details and the legend. Do not add dead navigation links just to imitate a screenshot.

## Desktop viewport contract

The index is a viewport-height application frame at desktop widths. Masthead, toolbar, navigation rail and the complete legend stay visible. Only the central Challenge pane scrolls; its column headers stay at the top of that pane. Compact vertical spacing at laptop heights must preserve every legend row and action. On phones, use normal page scrolling and the fixed bottom navigation. Verify both overflow behavior and visibility of the last legend action, not just a full-page screenshot.
