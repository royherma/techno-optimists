# Editorial V2

Roy's references: [first](design/2026-09-11-editorial-v2/reference-1.png), [second](design/2026-09-11-editorial-v2/reference-2.png). Preserved at original resolution. These are visual references, not product instructions or factual data.

## Direction

A newspaper front page: a large serif masthead, fine dividers, warm paper, one lead Challenge, supporting stories, and a quiet progress sidebar. Borrow the second reference's strong lead story and the first reference's clear navigation. Keep existing Challenge vocabulary and real data; never reproduce invented reference metrics.

## Viewport rule

Each browsing view fits the screen. Use explicit previous/next pages, not an infinite feed or hidden scroll panels. Show five stories on spacious desktops, three on laptops, and one on phones or short windows. Collapse the supporting sidebar before shrinking the reading content. Summaries are previews; Read more opens the complete existing Challenge page. Extreme zoom and windows below 480px tall retain natural overflow for accessibility.

## Switching and scope

`/v2` is the independently styled front page. The existing toolbar links to it; Classic view returns to `/`. Existing details, map, account and contribution flows remain shared. This first increment applies the new viewport rule to browsing. Subsequent reference-driven work should apply it to detail sections and forms with explicit steps or tabs rather than clipping their content.

## Content and interaction

Filter by Challenge type and search title, summary or location. Pagination resets on filter and viewport changes. Refresh all feed pages from the API after hydration; retain the build-time edition with a visible message if refresh fails. Progress counts describe loaded Challenges by stage, not measured impact. Empty results have explicit recovery guidance. No fabricated community activity or decorative map data.
