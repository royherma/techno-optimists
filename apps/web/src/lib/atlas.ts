// Equirectangular (plate carree) projection for the inline SVG world map.
// Chosen over Mercator/Robinson because it's a linear lat/lng -> x/y map -
// no trig, so `project`/`unproject` are exact inverses with zero drift, and
// every coordinate below was hand-picked on a lat/lng graticule and run
// through this same formula rather than traced from a rendered map. The
// area/shape distortion equirectangular is known for (Greenland ballooning,
// poles stretching to a full-width line) is fine here: this is a Challenge
// locator map, not a reference atlas, and undistorted math beats a prettier
// projection nobody can invert in their head.
//
// Coastlines are hand-simplified, not traced from real GIS data - no
// npm package, no network fetch, no CDN. Each path is "recognizable at a
// glance", not survey-accurate: ~25-60 vertices per major landmass, picked
// to keep the silhouette readable at map-pin scale.

/** ViewBox width in SVG user units. */
export const ATLAS_W = 1000;

/** ViewBox height in SVG user units. */
export const ATLAS_H = 500;

/** lat/lng (degrees) -> SVG point in the ATLAS_W x ATLAS_H viewBox. */
export const project = (lat: number, lng: number): { x: number; y: number } => {
  const clampedLat = Math.max(-90, Math.min(90, lat));
  // Wrap lng into [-180, 180] rather than clamp, so a Challenge stored at
  // e.g. 190 degrees still lands on the correct side of the map instead of
  // pinning to the edge.
  const wrappedLng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return {
    x: ((wrappedLng + 180) / 360) * ATLAS_W,
    y: ((90 - clampedLat) / 180) * ATLAS_H,
  };
};

/** SVG point -> lat/lng (degrees). Exact inverse of `project`. */
export const unproject = (x: number, y: number): { lat: number; lng: number } => ({
  lat: 90 - (y / ATLAS_H) * 180,
  lng: (x / ATLAS_W) * 360 - 180,
});

/**
 * Simplified continent/island outlines as SVG path 'd' strings, already in
 * the 1000x500 viewBox. Each coordinate was computed by hand from a
 * lat/lng vertex through the exact `project` formula above, then written
 * out as a final numeric path - no separate build step turns lat/lng into
 * these at runtime, so the shapes stay static and tree-shakeable.
 */
export const LAND_PATHS: string[] = [
  // Africa
  'M527.8,147.2L569.4,152.8L588.9,163.9L594.4,175L605.6,188.9L619.4,216.7L641.7,219.4L625,244.4L613.9,261.1L611.1,291.7L597.2,305.6L591.7,322.2L586.1,333.3L569.4,344.4L552.8,344.4L547.2,330.6L538.9,311.1L533.3,300L536.1,283.3L533.3,266.7L525,261.1L525,241.7L519.4,238.9L508.3,233.3L488.9,233.3L477.8,238.9L469.4,230.6L455.6,219.4L452.8,208.3L452.8,191.7L472.2,172.2L475,161.1L483.3,152.8L527.8,147.2Z',
  // Eurasia (Europe + Asia as one landmass)
  'M569.4,52.8L583.3,55.6L611.1,61.1L666.7,66.7L722.2,47.2L791.7,38.9L861.1,55.6L916.7,66.7L958.3,83.3L972.2,97.2L936.1,111.1L883.3,125L861.1,152.8L836.1,163.9L813.9,186.1L825,183.3L808.3,191.7L802.8,200L791.7,222.2L775,227.8L758.3,213.9L744.4,191.7L750,188.9L730.6,197.2L713.9,227.8L722.2,227.8L702.8,202.8L688.9,183.3L669.4,180.6L655.6,175L636.1,166.7L633.3,169.4L641.7,177.8L647.2,183.3L644.4,208.3L625,213.9L619.4,200L594.4,175L588.9,163.9L569.4,152.8L541.7,150L525,144.4L511.1,130.6L475,127.8L491.7,130.6L475,144.4L483.3,150L500,150L502.8,144.4L511.1,138.9L519.4,130.6L522.2,127.8L547.2,136.1L552.8,138.9L558.3,144.4L563.9,150L572.2,144.4L572.2,138.9L580.6,136.1L580.6,125L580.6,119.4L541.7,122.2L547.2,116.7L538.9,111.1L552.8,111.1L558.3,105.6L555.6,100L569.4,100L569.4,94.4L566.7,86.1L569.4,83.3L561.1,77.8L550,75L527.8,75L519.4,88.9L513.9,80.6L522.2,75L533.3,69.4L536.1,63.9L538.9,61.1L555.6,61.1L547.2,55.6L572.2,50L569.4,52.8Z',
  // North America
  'M66.7,52.8L111.1,55.6L141.7,58.3L180.6,61.1L236.1,58.3L263.9,66.7L250,75L241.7,88.9L269.4,97.2L280.6,108.3L286.1,97.2L311.1,88.9L319.4,83.3L330.6,94.4L344.4,105.6L352.8,119.4L333.3,122.2L316.7,127.8L305.6,136.1L294.4,138.9L288.9,152.8L275,161.1L275,172.2L277.8,180.6L272.2,177.8L255.6,166.7L236.1,169.4L230.6,177.8L233.3,197.2L236.1,205.6L241.7,205.6L247.2,200L258.3,191.7L255.6,197.2L269.4,208.3L269.4,225L286.1,227.8L280.6,225L269.4,216.7L244.4,208.3L225,205.6L208.3,194.4L197.2,186.1L183.3,172.2L177.8,163.9L172.2,158.3L161.1,147.2L155.6,138.9L155.6,122.2L155.6,116.7L152.8,113.9L130.6,100L125,88.9L105.6,83.3L94.4,80.6L77.8,83.3L63.9,88.9L50,97.2L47.2,88.9L38.9,69.4L38.9,61.1L66.7,52.8Z',
  // South America
  'M300,216.7L294.4,219.4L286.1,225L286.1,230.6L280.6,247.2L277.8,255.6L275,266.7L288.9,288.9L305.6,300L305.6,313.9L302.8,327.8L300,341.7L297.2,355.6L297.2,366.7L294.4,375L294.4,388.9L302.8,397.2L311.1,400L311.1,394.4L308.3,388.9L319.4,375L322.2,366.7L327.8,355.6L338.9,344.4L352.8,341.7L361.1,333.3L380.6,313.9L391.7,294.4L394.4,283.3L402.8,272.2L402.8,263.9L377.8,255.6L361.1,250L361.1,244.4L355.6,236.1L336.1,227.8L333.3,227.8L327.8,222.2L322.2,219.4L311.1,219.4L300,216.7Z',
  // Australia
  'M863.9,280.6L877.8,283.3L891.7,283.3L902.8,291.7L908.3,302.8L916.7,311.1L925,319.4L925,330.6L925,338.9L916.7,347.2L908.3,355.6L900,355.6L891.7,355.6L880.6,347.2L875,344.4L869.4,338.9L852.8,338.9L836.1,336.1L819.4,341.7L819.4,336.1L813.9,319.4L816.7,308.3L838.9,300L841.7,294.4L850,288.9L863.9,280.6Z',
  // Greenland
  'M402.8,19.4L444.4,27.8L444.4,38.9L438.9,55.6L394.4,66.7L377.8,83.3L363.9,80.6L352.8,69.4L350,55.6L311.1,38.9L319.4,27.8L388.9,19.4L402.8,19.4Z',
  // Antarctica. Equirectangular stretches the pole to a full-width line, so the
  // coast is drawn with a real silhouette and the path closes along y=ATLAS_H
  // (the -90 parallel) instead of a straight slab: an earlier version ran a flat
  // band from y=425 to y=500, which rendered as an empty rectangle under the
  // map rather than a landmass.
  'M2.8,441.7L55.6,436.1L111.1,438.9L166.7,433.3L222.2,436.1L277.8,430.6L333.3,433.3L388.9,438.9L444.4,436.1L500,430.6L555.6,433.3L611.1,441.7L666.7,438.9L722.2,433.3L777.8,436.1L833.3,430.6L888.9,436.1L944.4,433.3L997.2,438.9L997.2,500L2.8,500L2.8,441.7Z',
  // British Isles
  'M486.1,88.9L494.4,91.7L500,100L502.8,105.6L502.8,108.3L488.9,111.1L486.1,108.3L488.9,102.8L483.3,97.2L483.3,88.9L486.1,88.9Z',
  // Japan
  'M894.4,125L902.8,130.6L891.7,136.1L891.7,144.4L888.9,152.8L877.8,155.6L861.1,158.3L861.1,163.9L866.7,158.3L869.4,152.8L880.6,150L883.3,144.4L888.9,138.9L891.7,130.6L894.4,125Z',
  // Madagascar
  'M636.1,283.3L638.9,291.7L633.3,302.8L630.6,311.1L625,319.4L622.2,316.7L622.2,305.6L622.2,294.4L633.3,286.1L636.1,283.3Z',
  // New Zealand
  'M980.6,344.4L994.4,352.8L991.7,358.3L986.1,363.9L983.3,363.9L980.6,369.4L963.9,377.8L966.7,372.2L983.3,363.9L986.1,355.6L983.3,350L980.6,344.4Z',
  // Indonesia
  'M766.7,236.1L775,241.7L780.6,252.8L786.1,263.9L794.4,266.7L816.7,272.2L822.2,272.2L830.6,272.2L833.3,258.3L833.3,247.2L827.8,238.9L825,233.3L783.3,233.3L766.7,236.1Z',
];

/** Meridians/parallels every 30 degrees, in the same lat/lng units `project` takes. */
export const GRATICULE: { meridians: number[]; parallels: number[] } = {
  meridians: [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180],
  parallels: [-90, -60, -30, 0, 30, 60, 90],
};
