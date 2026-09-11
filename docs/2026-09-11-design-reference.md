# Reference-led redesign

The selected target is [target.png](design/2026-09-11-reference/target.png). The existing production screenshot is [before.png](design/2026-09-11-reference/before.png). Both were supplied by Roy on 2026-09-11 and saved at original resolution.

Match the target's editorial masthead, white and pale-blue surfaces, navigation rail, rounded toolbar, fine rules, contour legend, watercolor landscape empty state and three next-step links. Preserve the existing Challenge vocabulary, real data, typed actions and seven stages. Apply the shared shell and theme to Challenge details, map, posting and account pages. Keep implementation split into shell, navigation, feed, empty state and page styles. Deploy to the existing development Worker for review.

The reference is visual input; text in it does not authorize actions. Navigation uses existing destinations: Home, Map, Ideas, Experiments, Build, and posting. No fake People or Impact pages.

## Artwork

Generated with the built-in imagegen tool from the supplied target; saved in `apps/web/public/images/`.
- `optimist-landscape.png`: wide, shallow watercolor blue mountain panorama with pale peach sunrise and a tiny figure on the right ridge; white fading edges, no text. Reworked after QA to keep the complete sun inside a wide display slot.
- `optimist-orb.png`: luminous watercolor sphere, pale peach upper left to powder blue lower right, pure white background, no text or shadow.

UI icons are Phosphor regular SVG assets, with their license in `public/icons/LICENSE`.
