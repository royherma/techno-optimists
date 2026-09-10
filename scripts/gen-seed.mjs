// Generates packages/db/seed.sql. Edit the data here, never the .sql by hand.
// Images are Unsplash source URLs (hotlink, no key, no spend) with a tint that
// renders while they load, so the feed still reads as a feed offline.
import { writeFileSync } from 'node:fs'

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const j = (v) => q(JSON.stringify(v))
// Local SVG, drawn per Challenge by scripts/gen-seed-art.mjs. Hotlinked stock
// photos kept contradicting the caption (a barbecue illustrating "fishermen lose
// their catch"), which is worse than an abstract image. `id` is now the slug.
// Dimensions match the canvas gen-seed-art.mjs draws on. They ship with the
// media object because every surface sizes itself from the real shape now,
// and a seed row with no size would be the only one guessing.
const img = (slug, tint, alt) => ({ kind: 'image', url: `/seed/${slug}.svg`, w: 1200, h: 900, tint, alt })

// `name` is private (see the Person type) and no surface renders it, so the
// seed does not invent full names. Seeding them anyway would put a realistic
// first-and-last name in every row of a table nothing is allowed to publish -
// which is how a "temporary" demo value ends up looking like a real identity
// the day someone writes a new query.
const people = [
  ['p_niran','niran','Chiang Mai, Thailand',['dairy farming','field testing'],['scout','tester']],
  ['p_mei','mei','Shenzhen, China',['electronics','sourcing','PCB'],['builder','expert']],
  ['p_tomas','tomas','Krakow, Poland',['embedded','rust','firmware'],['builder','thinker']],
  ['p_aisha','aisha','Lagos, Nigeria',['public health','entomology'],['researcher','expert']],
  ['p_dave','dave','Oakland, USA',['thermodynamics','simulation'],['thinker','researcher']],
  ['p_sofia','sofia','Palermo, Italy',['marine biology','cold chain'],['researcher','tester']],
  ['p_arun','arun','Kochi, India',['solar','power electronics'],['builder','expert']],
  ['p_hana','hana','Osaka, Japan',['industrial design','CAD'],['builder','thinker']],
  ['p_lucas','lucas','Belem, Brazil',['drones','computer vision'],['builder','scout']],
  ['p_ingrid','ingrid','Tromso, Norway',['materials','insulation'],['expert','researcher']],
]

// [slug, type, stage, title, summary, location, tags, author, media, daysAgo, activityDaysAgo, actions{}, updates[]]
const challenges = [
  ['milk-cooling-loss','problem','ideas',
   'This farmer loses a third of his milk to the afternoon heat',
   'No grid power at the collection point. Milk sits at 34C for four hours before the truck comes.',
   'Chiang Mai, Thailand', ['agriculture','cooling','off-grid'], 'p_niran',
   [img('milk-cooling-loss','#c9b89a','Milk cans standing in the sun')], 21, 1,
   { have_problem: 4712, want_this: 890, have_idea: 143, can_help: 34, will_test: 12, building_this: 3, follow: 1205 },
   [['p_dave','understand','Ran the numbers on evaporative cooling for this humidity. 61% RH at 34C gives about 6C of drop - not enough alone, but it halves the load on anything we add.'],
    ['p_arun','ideas','Solar thermal absorption chiller is overkill here. A 200W panel plus a compressor and a phase-change buffer would hold 4C through the afternoon for around $180 in parts.']]],

  ['drone-compute-mesh','idea','understand',
   'Could compute move around a city on autonomous drones?',
   'GPUs are idle at night in one district and saturated in another. What if the hardware flew to the demand?',
   null, ['compute','drones','infrastructure'], 'p_lucas',
   [img('drone-compute-mesh','#8fa3b8','A drone carrying a compute unit over a city')], 34, 3,
   { have_problem: 61, want_this: 2204, have_idea: 412, can_help: 88, will_test: 9, building_this: 6, follow: 3102 },
   [['p_tomas','understand','Battery math is brutal. Carrying an H100 and its cooling means you spend more energy flying it than you save. It only works if the payload is under about 2kg - so edge inference silicon, not datacentre parts.']]],

  ['rainy-season-mosquitoes','problem','understand',
   'This village gets a strange mosquito surge for six weeks every rainy season',
   'It starts nine days after the first heavy rain, every year, and stops as abruptly as it starts.',
   'Cross River, Nigeria', ['health','water','seasonal'], 'p_aisha',
   [img('rainy-season-mosquitoes','#7d8f6a','Rain falling into standing water with mosquitoes above it')], 12, 2,
   { have_problem: 1840, want_this: 620, have_idea: 97, can_help: 41, will_test: 23, building_this: 1, follow: 890 },
   [['p_aisha','understand','Nine days matches the Aedes egg-to-adult cycle almost exactly. The eggs are already there, laid dry, waiting for water. That means the intervention window is before the rain, not after.']]],

  ['bedroom-8c-hotter','problem','ideas',
   'My bedroom runs 8C hotter than the rest of the apartment',
   'Same building, same floor, same size. Thermal camera shows the wall glowing after sunset.',
   'Palermo, Italy', ['housing','thermal','cheap-fix'], 'p_sofia',
   [img('bedroom-8c-hotter','#b8785f','One wall of a room radiating stored heat')], 8, 1,
   { have_problem: 2960, want_this: 410, have_idea: 268, can_help: 52, will_test: 31, building_this: 4, follow: 1120 },
   [['p_ingrid','ideas','That is a thermal mass problem, not an insulation problem. The wall is charging all day and discharging into the room at night. External shading beats anything you do on the inside - and it is a $40 fix.']]],

  ['catch-spoils-before-shore','problem','test',
   'Fishermen here lose part of every catch before they reach shore',
   'Six hours back to port with no ice. The last of the catch is unsellable by the time they dock.',
   'Kochi, India', ['fishing','cold chain','livelihood'], 'p_arun',
   [img('catch-spoils-before-shore','#5d7f8a','A fishing boat on open water under the sun')], 56, 4,
   { have_problem: 3310, want_this: 1290, have_idea: 204, can_help: 76, will_test: 44, building_this: 11, follow: 2401 },
   [['p_mei','build','Sourced the parts for the insulated box version. 40mm PU panel, reflective outer skin, $23 a unit at ten pieces.'],
    ['p_arun','test','Two boats ran it for a week. Catch temperature at dock was 11C against 24C in the control boat. One box leaked at the lid seam - fixing the gasket and going again.']]],

  ['irrigation-timer-that-lasts','build','build',
   'A drip irrigation timer that survives being left in a field',
   'Every commercial one dies within a season. Cheap plastic, dead battery, corroded contacts.',
   'Krakow, Poland', ['agriculture','hardware','durability'], 'p_tomas',
   [img('irrigation-timer-that-lasts','#7f9463','A timer on a drip irrigation line in a field')], 41, 5,
   { have_problem: 720, want_this: 1830, have_idea: 88, can_help: 62, will_test: 38, building_this: 14, follow: 1640 },
   [['p_tomas','build','Third revision. Potted the whole board in epoxy, one hall-effect sensor through the case so there are no external contacts at all. Runs eleven months on one 18650.']]],

  ['thermal-camera-under-50','experiment','learn',
   'Can you build a useful thermal camera for under $50?',
   'The sensors are cheap now. Everything else about the product is not. Testing whether the gap is real.',
   'Osaka, Japan', ['imaging','teardown','cheap-fix'], 'p_hana',
   [img('thermal-camera-under-50','#6b7b95','A thermal image showing a hot spot')], 67, 9,
   { have_problem: 190, want_this: 2680, have_idea: 320, can_help: 94, will_test: 51, building_this: 22, follow: 2890 },
   [['p_hana','learn','Answer is yes but the resolution is the catch. $46 gets you 32x24 - enough to find a heat leak in a wall, useless for anything needing detail. Which turns out to be most of what people actually want it for.']]],

  ['grid-drops-every-evening','problem','spot',
   'The grid here drops for two hours every evening and nobody knows why',
   'Same window, 19:00 to 21:00, five days a week. Not the weekend. Utility says nothing is wrong.',
   'Lagos, Nigeria', ['energy','diagnosis','infrastructure'], 'p_aisha',
   [img('grid-drops-every-evening','#c99a52','Power lines at dusk with most windows dark')], 3, 3,
   { have_problem: 5210, want_this: 340, have_idea: 61, can_help: 28, will_test: 8, building_this: 0, follow: 760 }, []],

  ['salt-water-battery','experiment','ideas',
   'Testing whether a salt-water battery can run a fridge overnight',
   'Terrible energy density, wonderful price, completely non-flammable. Good trade for a stationary use.',
   'Tromso, Norway', ['energy','storage','experiment'], 'p_ingrid',
   [img('salt-water-battery','#4f6f86','Salt-water cells wired in series')], 29, 6,
   { have_problem: 140, want_this: 980, have_idea: 176, can_help: 45, will_test: 19, building_this: 7, follow: 1090 }, []],

  ['plastic-sorting-by-sound','idea','ideas',
   'Sorting plastic by the sound it makes when you tap it',
   'Different polymers ring differently. A $3 microphone might do what a $12,000 spectrometer does.',
   'Belem, Brazil', ['recycling','audio','cheap-fix'], 'p_lucas',
   [img('plastic-sorting-by-sound','#8a9a7b','Coloured plastics beside a microphone')], 18, 7,
   { have_problem: 410, want_this: 1520, have_idea: 244, can_help: 71, will_test: 26, building_this: 5, follow: 1380 }, []],

  ['well-pump-runs-dry','problem','understand',
   'The village well pump burns out every dry season',
   'It runs dry, overheats, and dies. A new one costs four months of income.',
   'Cross River, Nigeria', ['water','pumps','off-grid'], 'p_aisha',
   [img('well-pump-runs-dry','#9c8b6e','A hand pump above a falling water table')], 47, 11,
   { have_problem: 2210, want_this: 760, have_idea: 132, can_help: 58, will_test: 21, building_this: 3, follow: 1310 }, []],

  ['cheap-water-quality-test','build','test',
   'A water test strip reader that works on any phone camera',
   'The strips are cheap. Reading them by eye under different light is where the accuracy dies.',
   'Shenzhen, China', ['water','health','imaging'], 'p_mei',
   [img('cheap-water-quality-test','#6f8f9a','A phone reading a test strip against a colour card')], 73, 8,
   { have_problem: 890, want_this: 2140, have_idea: 158, can_help: 83, will_test: 62, building_this: 16, follow: 2260 },
   [['p_mei','test','Colour card in frame fixes the white balance problem. 94% agreement with the lab reference across 200 samples, and the failures are all at the very low end where the strip itself is unreliable.']]],
]

const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 19).replace('T', ' ')
const out = ['-- GENERATED by scripts/gen-seed.mjs - do not edit by hand.', '']

for (const [id, handle, location, skills, roles] of people) {
  // schema.sql has `name TEXT NOT NULL`, so the column is filled with the
  // handle rather than a person's name.
  out.push(`INSERT INTO people (id,handle,name,avatar_url,location,skills,roles) VALUES (${q(id)},${q(handle)},${q(handle)},NULL,${q(location)},${j(skills)},${j(roles)});`)
}
out.push('')

let u = 0
for (const [slug, type, stage, title, summary, location, tags, author, media, days, act, actions, updates] of challenges) {
  const id = `ch_${slug.replace(/-/g, '_')}`
  out.push(`INSERT INTO challenges (id,slug,type,stage,title,summary,body,media,location,tags,author_id,created_at,last_activity_at,seed_actions) VALUES (${q(id)},${q(slug)},${q(type)},${q(stage)},${q(title)},${q(summary)},NULL,${j(media)},${q(location)},${j(tags)},${q(author)},${q(iso(days))},${q(iso(act))},${j(actions)});`)
  // Demo scale goes in challenges.seed_actions as a json blob, NOT as fake rows.
  // Seeding 4,712 people to make one number look right would poison every
  // person-level query on the site. Real rows below are only our 10 seed people,
  // so "who can help" lists real names while the count reads realistically.
  for (const [kind, n] of Object.entries(actions)) {
    if (!n) continue
    out.push(`INSERT INTO challenge_actions (challenge_id,person_id,kind,created_at) SELECT ${q(id)}, id, ${q(kind)}, ${q(iso(act))} FROM people ORDER BY id LIMIT ${Math.min(n, 4)};`)
  }
  // Space updates backwards from last_activity_at so the progress log has a real
  // chronology. All-same-timestamp made ORDER BY created_at return insertion
  // order, which put a later stage above an earlier one on the Challenge page.
  updates.forEach(([aid, ustage, body], i) => {
    const at = iso(act + (updates.length - 1 - i) * 3)
    out.push(`INSERT INTO updates (id,challenge_id,author_id,stage,body,media,created_at) VALUES (${q('up_' + (++u))},${q(id)},${q(aid)},${q(ustage)},${q(body)},'[]',${q(at)});`)
  })
  out.push('')
}
writeFileSync('packages/db/seed.sql', out.join('\n'))
console.log(`seed.sql: ${people.length} people, ${challenges.length} challenges, ${u} updates`)
