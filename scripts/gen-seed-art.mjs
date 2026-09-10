// Generates apps/web/public/seed/*.svg - one abstract illustration per Challenge.
// Not photographs: hotlinked stock kept mismatching the caption (a barbecue for
// "fishermen lose their catch"), and generated images cost money. These are
// free, offline, and always match because we draw exactly what the caption says.
import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('apps/web/public/seed', { recursive: true })

const W = 1200, H = 900
const wrap = (bg, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect width="${W}" height="${H}" fill="${bg}"/>${inner}</svg>`

// Sun / heat source with rays.
const sun = (cx, cy, r, c, n = 12) => {
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    s += `<line x1="${cx + Math.cos(a) * (r + 14)}" y1="${cy + Math.sin(a) * (r + 14)}" x2="${cx + Math.cos(a) * (r + 40)}" y2="${cy + Math.sin(a) * (r + 40)}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`
  }
  return s
}
const drop = (x, y, s, c) =>
  `<path d="M${x} ${y - s} C ${x + s * 0.9} ${y - s * 0.1}, ${x + s * 0.62} ${y + s * 0.75}, ${x} ${y + s * 0.75} C ${x - s * 0.62} ${y + s * 0.75}, ${x - s * 0.9} ${y - s * 0.1}, ${x} ${y - s} Z" fill="${c}"/>`
const wave = (y, c, amp = 22, w = 9, op = 1) => {
  let d = `M0 ${y}`
  for (let x = 0; x <= W; x += 60) d += ` q30 -${amp} 60 0`
  return `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity="${op}"/>`
}
const bar = (x, y, w, h, c, r = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`
const circ = (x, y, r, c, op = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${op}"/>`

const art = {
  // Milk cans in the sun, heat rising.
  'milk-cooling-loss': wrap('#e8dcc3', [
    sun(980, 190, 78, '#e0912f'),
    ...[0, 1, 2].map((i) => {
      const x = 250 + i * 210
      return bar(x, 470, 130, 300, '#9aa7ad', 14) + bar(x + 34, 424, 62, 60, '#8894a0', 10) + bar(x + 16, 540, 98, 16, '#7d8a95', 6)
    }),
    ...[0, 1, 2, 3].map((i) => `<path d="M${300 + i * 190} 400 q26 -46 0 -92 q-26 -46 0 -92" stroke="#d9a05b" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.75"/>`),
    bar(0, 770, W, 130, '#c2b391', 0),
  ].join('')),

  // Drone carrying a compute payload over a city grid.
  'drone-compute-mesh': wrap('#cfd9e2', [
    ...[0, 1, 2, 3, 4, 5].map((i) => bar(120 + i * 170, 600 + (i % 3) * 40, 110, 300, '#8ea3b8', 6)),
    bar(0, 830, W, 70, '#7c92a8', 0),
    `<g><line x1="420" y1="300" x2="780" y2="300" stroke="#40506a" stroke-width="14" stroke-linecap="round"/>`,
    bar(540, 268, 120, 74, '#40506a', 12), bar(566, 292, 68, 30, '#8fd6c8', 5),
    ...[440, 760].map((x) => `<ellipse cx="${x}" cy="282" rx="86" ry="11" fill="#40506a" opacity="0.55"/><line x1="${x}" y1="288" x2="${x}" y2="312" stroke="#40506a" stroke-width="10"/>`),
    `</g>`,
    ...[0, 1, 2].map((i) => `<circle cx="600" cy="${400 + i * 46}" r="${16 + i * 16}" fill="none" stroke="#40506a" stroke-width="4" opacity="${0.4 - i * 0.1}"/>`),
  ].join('')),

  // Standing water, rain, mosquito swarm.
  'rainy-season-mosquitoes': wrap('#c7d2bd', [
    bar(0, 560, W, 340, '#6f8560', 0),
    `<ellipse cx="600" cy="700" rx="430" ry="118" fill="#4e6a63"/>`,
    `<ellipse cx="600" cy="690" rx="330" ry="82" fill="#5d7d74" opacity="0.7"/>`,
    ...Array.from({ length: 26 }, (_, i) => {
      const x = 90 + ((i * 137) % 1020), y = 90 + ((i * 79) % 380)
      return `<line x1="${x}" y1="${y}" x2="${x - 12}" y2="${y + 42}" stroke="#8fa8bd" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`
    }),
    ...Array.from({ length: 9 }, (_, i) => {
      const x = 240 + ((i * 211) % 760), y = 430 + ((i * 97) % 150)
      return circ(x, y, 7, '#2f3b33') + `<line x1="${x - 16}" y1="${y - 9}" x2="${x + 16}" y2="${y - 9}" stroke="#2f3b33" stroke-width="3.5" stroke-linecap="round"/>`
    }),
  ].join('')),

  // One wall of a room glowing with stored heat.
  'bedroom-8c-hotter': wrap('#efe4d6', [
    bar(0, 0, 470, H, '#c96a44', 0),
    bar(470, 0, 24, H, '#b1583a', 0),
    ...[0, 1, 2, 3].map((i) => bar(0, 90 + i * 200, 470, 96, '#d98459', 0)),
    bar(560, 430, 520, 300, '#b8ab97', 12), bar(590, 470, 200, 120, '#cdc2b0', 8),
    sun(1020, 150, 52, '#e0a24a', 10),
    ...[0, 1, 2, 3, 4].map((i) => `<path d="M${540 + i * 34} 620 q22 -60 0 -120" stroke="#c96a44" stroke-width="7" fill="none" stroke-linecap="round" opacity="${0.5 - i * 0.07}"/>`),
    bar(0, 800, W, 100, '#a89477', 0),
  ].join('')),

  // Boat, long haul home, warming fish.
  'catch-spoils-before-shore': wrap('#a8c2cc', [
    sun(240, 170, 62, '#dba95c', 10),
    wave(600, '#5d8496', 20, 11), wave(660, '#4d7284', 24, 12), wave(730, '#3f6273', 26, 13), wave(810, '#345566', 28, 14),
    `<path d="M420 560 L880 560 L810 660 L490 660 Z" fill="#4a5b63"/>`,
    bar(600, 420, 16, 140, '#3a484f', 4),
    `<path d="M624 430 L790 545 L624 545 Z" fill="#e4ded2"/>`,
    ...[0, 1, 2, 3].map((i) => `<ellipse cx="${510 + i * 84}" cy="600" rx="30" ry="15" fill="#9fb6b0"/>`),
  ].join('')),

  // Drip line, field rows, timer unit.
  'irrigation-timer-that-lasts': wrap('#d5dcc2', [
    bar(0, 480, W, 420, '#8ba169', 0),
    ...[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${540 + i * 80} Q600 ${510 + i * 80} 1200 ${540 + i * 80}" stroke="#6d8450" stroke-width="12" fill="none"/>`),
    `<line x1="120" y1="330" x2="1080" y2="330" stroke="#4d5a63" stroke-width="14" stroke-linecap="round"/>`,
    bar(470, 250, 190, 150, '#3f4d57', 16), bar(506, 288, 118, 56, '#7fd6a8', 8),
    ...[0, 1, 2, 3, 4, 5].map((i) => drop(220 + i * 156, 400, 22, '#5b8fb0')),
  ].join('')),

  // Thermal camera view: hot spot in a cool frame.
  'thermal-camera-under-50': wrap('#2b3348', [
    bar(180, 130, 840, 640, '#1d2436', 18),
    ...Array.from({ length: 7 }, (_, i) =>
      `<ellipse cx="620" cy="450" rx="${360 - i * 48}" ry="${270 - i * 36}" fill="${['#2b4570', '#2f5f86', '#3d8a8a', '#6fae66', '#c3b054', '#d99a44', '#cf5b3a'][i]}" opacity="0.9"/>`).join(''),
    bar(180, 130, 840, 640, 'none', 18).replace('fill="none"', 'fill="none" stroke="#5c6b8a" stroke-width="10"'),
    ...[0, 1, 2].map((i) => bar(216, 168 + i * 34, 90, 12, '#8fa3c4', 4)),
  ].join('')),

  // Power lines, evening, one dark window band.
  'grid-drops-every-evening': wrap('#3d4a63', [
    circ(950, 220, 76, '#d9a15a'),
    ...[0, 1, 2].map((i) => {
      const x = 200 + i * 400
      return bar(x, 300, 22, 500, '#232c3d', 0) + bar(x - 70, 340, 162, 18, '#232c3d', 0) + bar(x - 50, 400, 122, 16, '#232c3d', 0)
    }),
    ...[0, 1].map((i) => `<path d="M${222 + i * 400} 350 Q${420 + i * 400} 430 ${600 + i * 400} 350" stroke="#232c3d" stroke-width="8" fill="none"/>`),
    bar(0, 800, W, 100, '#1a2130', 0),
    ...Array.from({ length: 14 }, (_, i) => bar(60 + i * 82, 700, 44, 100, i % 3 === 0 ? '#e0b871' : '#28324a', 3)),
  ].join('')),

  // Salt-water cells wired in series.
  'salt-water-battery': wrap('#c3d3dd', [
    ...[0, 1, 2, 3].map((i) => {
      const x = 190 + i * 220
      return bar(x, 340, 150, 330, '#5b7f9c', 14) + bar(x + 14, 380, 122, 250, '#8fbdd4', 8) +
        bar(x + 52, 300, 46, 46, '#3f5d75', 6) +
        Array.from({ length: 5 }, (_, k) => circ(x + 40 + (k % 3) * 36, 440 + Math.floor(k / 3) * 70, 11, '#e7f2f6', 0.85)).join('')
    }),
    ...[0, 1, 2].map((i) => `<line x1="${340 + i * 220}" y1="322" x2="${412 + i * 220}" y2="322" stroke="#3f5d75" stroke-width="10" stroke-linecap="round"/>`),
    bar(0, 700, W, 200, '#a9bcc8', 0),
  ].join('')),

  // Sorting plastics by the sound they make.
  'plastic-sorting-by-sound': wrap('#d9dcc9', [
    bar(0, 640, W, 260, '#9aa384', 0),
    ...[['#c95f4a', 250], ['#4a8ac9', 470], ['#4ab07a', 690], ['#d0a13f', 910]].map(([c, x]) =>
      bar(x, 470, 150, 170, c, 14) + bar(x + 40, 430, 70, 44, c, 8)),
    ...[0, 1, 2].map((i) => `<path d="M170 555 q${-40 - i * 34} -${44 + i * 34} 0 -${88 + i * 68}" stroke="#5c6650" stroke-width="7" fill="none" stroke-linecap="round" opacity="${0.75 - i * 0.2}"/>`),
    circ(150, 512, 34, '#3f4738'), bar(140, 512, 20, 130, '#3f4738', 6),
  ].join('')),

  // Hand pump running dry over a falling water table.
  'well-pump-runs-dry': wrap('#ddd3bb', [
    bar(0, 600, W, 300, '#b8a884', 0),
    `<ellipse cx="600" cy="620" rx="250" ry="52" fill="#8d7f61"/>`,
    bar(560, 300, 80, 320, '#6b7378', 10), bar(500, 270, 200, 52, '#5c646a', 10),
    `<path d="M700 296 L840 210 L880 250 L740 336 Z" fill="#5c646a"/>`,
    ...[0, 1, 2, 3].map((i) => `<path d="M180 ${740 + i * 42} Q600 ${710 + i * 42} 1020 ${740 + i * 42}" stroke="#7d8fa0" stroke-width="9" fill="none" opacity="${0.55 - i * 0.12}"/>`),
    ...[0, 1, 2].map((i) => drop(600 + (i - 1) * 26, 660 + i * 14, 13, '#7d8fa0')),
  ].join('')),

  // Test strip read by a phone camera against a colour card.
  'cheap-water-quality-test': wrap('#cfdbdd', [
    bar(150, 250, 330, 500, '#3d4a52', 26), bar(176, 292, 278, 400, '#8fb7c4', 10),
    circ(315, 726, 20, '#5c6b74'),
    ...[['#e4d95c', 0], ['#a7c95c', 1], ['#5cb28a', 2], ['#4a8fb0', 3], ['#8a6bb0', 4]].map(([c, i]) =>
      bar(620, 300 + i * 92, 260, 66, c, 8)),
    bar(600, 280, 300, 500, 'none', 14).replace('fill="none"', 'fill="none" stroke="#4d5a62" stroke-width="8"'),
    ...[0, 1].map((i) => `<line x1="480" y1="${420 + i * 120}" x2="596" y2="${420 + i * 120}" stroke="#4d5a62" stroke-width="6" stroke-dasharray="14 10"/>`),
  ].join('')),
}

let n = 0
for (const [slug, svg] of Object.entries(art)) {
  writeFileSync(`apps/web/public/seed/${slug}.svg`, svg); n++
}
console.log(`wrote ${n} svg`)
