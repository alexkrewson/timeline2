/**
 * Generates samples/sample-life.timeline.json — a fictional personal timeline.
 *
 * This is a test fixture with a job, not a demo. Hand-made test data is too
 * tidy: it never triggers the spill rule, never asks a 1-day bar to carry a
 * 40-character label, never puts the same event in three rows. Each block below
 * is built to exercise a specific part of the renderer, noted inline.
 *
 * Everyone in it is invented.
 *
 * Run: node scripts/make-sample.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, '..', 'samples', 'sample-life.timeline.json')

function daysFromCivil(y, m, d) {
  const yy = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const D = (y, m = 1, d = 1) => daysFromCivil(y, m, d)

/** Seeded LCG — the fixture must be byte-identical on every run. */
let seed = 20260801
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))

let n = 0
const id = (p) => `${p}_${(++n).toString(36).padStart(3, '0')}`

const tags = [
  { id: 't_era', label: 'era', color: '#5a8460', parent: null, styleChannel: 'fill' },
  { id: 't_home', label: 'home', color: '#b87040', parent: null, styleChannel: 'fill' },
  { id: 't_school', label: 'school', color: '#8878a8', parent: null, styleChannel: 'fill' },
  { id: 't_work', label: 'work', color: '#3d8c7a', parent: null, styleChannel: 'fill' },
  { id: 't_friends', label: 'friends', color: '#6a8ca8', parent: null, styleChannel: 'fill' },
  { id: 't_travel', label: 'travel', color: '#c49a6c', parent: null, styleChannel: 'fill' },
  { id: 't_music', label: 'music', color: '#ac748c', parent: null, styleChannel: 'fill' },
  { id: 't_health', label: 'health', color: '#9c6450', parent: null, styleChannel: 'fill' },
  { id: 't_family', label: 'family', color: '#5a7898', parent: null, styleChannel: 'fill' },
  // Modifiers — independent channels, each legible without colour (§8.2).
  { id: 't_dormant', label: 'dormant', color: '#8a7d68', parent: null, styleChannel: 'saturation' },
  { id: 't_partner', label: 'partner', color: '#ac748c', parent: null, styleChannel: 'stripe' },
  { id: 't_fuzzy', label: 'approximate', color: '#8a7d68', parent: null, styleChannel: 'outline' },
]

const events = []
const ev = (label, start, end, tagIds, extra = {}) =>
  events.push({
    id: id('e'),
    label,
    start,
    // An ongoing event stores end === start — its real end is computed at
    // render time. Anything else breaks the end >= start invariant on reload.
    end: extra.ongoing ? start : (end ?? start),
    ongoing: false,
    tags: tagIds,
    note: '',
    startPrecision: null,
    endPrecision: null,
    source: 'personal',
    ...extra,
  })

// --- eras: the pinned backdrop band, tiling without gaps ------------------
ev('Childhood in Ohio', D(1988, 4, 2), D(2006, 8, 20), ['t_era'])
ev('College years', D(2006, 8, 21), D(2010, 5, 15), ['t_era'])
ev('The Chicago years', D(2010, 5, 16), D(2016, 9, 30), ['t_era'])
ev('The Portland years', D(2016, 10, 1), D(2023, 4, 30), ['t_era'])
ev('Van life', D(2023, 5, 1), D(2024, 6, 15), ['t_era'])
ev('Back in Portland', D(2024, 6, 16), 0, ['t_era'], { ongoing: true })

// --- homes: deliberate 1–2 week move overlaps, so lanes sub-band ----------
ev('Maple Street, Dayton', D(1988, 4, 2), D(2001, 7, 14), ['t_home'])
ev('Cedar Court, Dayton', D(2001, 7, 1), D(2006, 8, 25), ['t_home'])
ev('Kerrey Hall (dorm)', D(2006, 8, 20), D(2007, 5, 20), ['t_home', 't_school'])
ev('The Baltic Ave house', D(2007, 8, 25), D(2010, 5, 30), ['t_home'])
ev('Logan Square studio', D(2010, 6, 1), D(2012, 9, 15), ['t_home'])
ev('Humboldt Park 2-flat', D(2012, 9, 1), D(2016, 10, 8), ['t_home'])
ev('SE Belmont apartment', D(2016, 10, 1), D(2020, 2, 29), ['t_home'])
ev('The Alberta house', D(2020, 2, 15), D(2023, 5, 5), ['t_home'])
ev('The van', D(2023, 5, 1), D(2024, 6, 20), ['t_home'])
ev('N Killingsworth', D(2024, 6, 15), 0, ['t_home'], { ongoing: true })

// --- school -------------------------------------------------------------
ev('Fairview Elementary', D(1993, 8, 30), D(1999, 6, 4), ['t_school'])
ev('Wright Middle School', D(1999, 8, 25), D(2002, 6, 6), ['t_school'])
ev('Dayton Central High', D(2002, 8, 26), D(2006, 6, 3), ['t_school'])
ev('BA, Urban Studies', D(2006, 8, 21), D(2010, 5, 15), ['t_school'])
ev('Night classes — GIS certificate', D(2013, 9, 3), D(2014, 12, 12), ['t_school'])

// --- work: overlapping main job + side work ------------------------------
ev('Scooping ice cream at Grays', D(2004, 6, 1), D(2006, 8, 10), ['t_work'])
ev('Campus library shelver', D(2007, 9, 4), D(2010, 5, 10), ['t_work'])
ev('Planning intern, City of Chicago', D(2010, 6, 14), D(2011, 3, 31), ['t_work'])
ev('Associate planner, Vela Group', D(2011, 4, 4), D(2016, 9, 23), ['t_work'])
ev('Freelance mapping (side)', D(2013, 2, 1), D(2019, 8, 30), ['t_work'])
ev('Senior planner, Cascade Civic', D(2016, 11, 7), D(2023, 4, 14), ['t_work'])
ev('Consulting, self-employed', D(2023, 6, 1), 0, ['t_work'], { ongoing: true })
ev('Contract: transit study', D(2024, 1, 8), D(2024, 11, 22), ['t_work'])
ev('Contract: county bike plan', D(2024, 9, 3), D(2025, 6, 30), ['t_work'])

// --- family: instantaneous events, the 3px minimum glyph ------------------
ev('Born', D(1988, 4, 2), D(1988, 4, 2), ['t_family'])
ev('Sister born', D(1991, 11, 19), D(1991, 11, 19), ['t_family'])
ev('Grandma Ruth died', D(2009, 3, 8), D(2009, 3, 8), ['t_family'])
ev('Parents divorced', D(1999, 6, 30), D(1999, 6, 30), ['t_family'])
ev('Married', D(2019, 9, 14), D(2019, 9, 14), ['t_family'])
ev('Dog — Biscuit', D(2017, 5, 20), D(2029, 1, 1), ['t_family'], { ongoing: true })

// --- health: one instant, one long ongoing, one approximate --------------
ev('Broken arm', D(1997, 8, 12), D(1997, 10, 3), ['t_health'])
ev('Appendectomy', D(2014, 2, 27), D(2014, 2, 27), ['t_health'])
ev('Running consistently', D(2018, 1, 8), 0, ['t_health'], { ongoing: true })
ev('That long weird illness', D(2021, 11, 1), D(2022, 3, 1), ['t_health', 't_fuzzy'])

// --- music ---------------------------------------------------------------
ev('Piano lessons', D(1996, 9, 10), D(2003, 6, 1), ['t_music'])
ev('Trumpet, school band', D(2000, 9, 5), D(2006, 6, 3), ['t_music'])
ev('The Wednesday Nights (band)', D(2008, 2, 14), D(2011, 8, 20), ['t_music'])
ev('Learning bass', D(2020, 4, 1), 0, ['t_music'], { ongoing: true })
ev('Choir', D(2015, 9, 1), D(2016, 9, 1), ['t_music', 't_dormant'])

// --- friends: the spill trigger. Long, heavily overlapping spans ---------
// A 30px lane at an 8px minimum sub-band holds 3; this row will need many
// lanes and will flag past its soft cap. That is the point.
const NAMES = [
  'Sam', 'Dev', 'Marisol', 'Tobias', 'Wren', 'Ade', 'Priya', 'Callum', 'Ines',
  'Jonah', 'Nadia', 'Emiliano', 'Bex', 'Kofi', 'Lucia', 'Ravi', 'Hattie',
  'Oskar', 'Yuki', 'Talia', 'Bram', 'Noor', 'Diego', 'Maeve', 'Ilya',
  'Saoirse', 'Femi', 'Greta', 'Anwar', 'Juno', 'Levi', 'Clementine',
  'Rasmus', 'Aiko', 'Theo', 'Zaid',
]
for (const name of NAMES) {
  const startY = between(1994, 2024)
  const span = between(1, 22)
  const start = D(startY, between(1, 12), between(1, 28))
  const stillGoing = rnd() < 0.3 && startY + span >= 2024
  const end = stillGoing ? start : D(Math.min(2026, startY + span), between(1, 12), between(1, 28))
  const extraTags = []
  if (rnd() < 0.22) extraTags.push('t_dormant')
  if (rnd() < 0.06) extraTags.push('t_partner')
  ev(name, start, Math.max(start, end), ['t_friends', ...extraTags], { ongoing: stillGoing })
}

// --- travel: short bars with long labels — the overflow lane engine -------
const TRIPS = [
  ['Roadtrip to Yellowstone and the Tetons with Sam and Dev', 2009, 8, 11],
  ['Two weeks in Oaxaca', 2012, 11, 14],
  ['Iceland ring road', 2015, 6, 12],
  ['Sister’s wedding in Savannah', 2016, 4, 4],
  ['Backpacking the Wonderland Trail', 2018, 8, 9],
  ['Tokyo and Kyoto', 2019, 3, 16],
  ['Honeymoon — Lisbon and the Azores', 2019, 9, 15],
  ['A very long weekend in Marfa', 2021, 10, 4],
  ['Driving the Blue Ridge Parkway end to end', 2023, 6, 8],
  ['Baja, most of a month', 2023, 11, 26],
  ['Conference in Amsterdam', 2024, 5, 5],
  ['Thanksgiving in Ohio', 2024, 11, 5],
  ['Utah canyons with Wren', 2025, 4, 9],
  ['Day trip to the coast', 2025, 7, 1],
  ['Cascade Lakes loop', 2025, 9, 3],
]
for (const [label, y, m, len] of TRIPS) {
  const start = D(y, m, between(1, 20))
  ev(label, start, start + len - 1, ['t_travel'])
}
// A dense cluster of one-day trips in a single month — instant-event pileup.
for (let i = 0; i < 12; i++) {
  const day = D(2022, 6, 1) + i * 2
  ev(`Scouting site ${i + 1}`, day, day, ['t_travel'])
}

// --- an event with no tags at all, and one with six ----------------------
ev('Something I never categorised', D(2013, 5, 1), D(2013, 8, 1), [])
ev(
  'The summer everything happened at once',
  D(2016, 6, 1),
  D(2016, 9, 30),
  ['t_home', 't_work', 't_friends', 't_travel', 't_music', 't_health'],
)

const row = (label, tagIds, extra = {}) => ({
  id: id('r'),
  label,
  source: { kind: 'tag', tagIds },
  packing: 'single',
  maxLanes: 4,
  minSubBandPx: 8,
  height: 30,
  layer: 'stack',
  pinned: false,
  sort: 'start',
  order: 0,
  visible: true,
  ...extra,
})

const rows = [
  row('era', ['t_era'], { layer: 'backdrop', pinned: true, height: 22, order: 0 }),
  row('home', ['t_home'], { order: 1 }),
  row('school', ['t_school'], { order: 2 }),
  row('work', ['t_work'], { order: 3 }),
  row('friends', ['t_friends'], { order: 4, maxLanes: 6, height: 26 }),
  row('travel', ['t_travel'], { order: 5, height: 24 }),
  row('music', ['t_music'], { order: 6 }),
  row('health', ['t_health'], { order: 7 }),
  row('family', ['t_family'], { order: 8, height: 24 }),
]

const created = '2026-08-01T00:00:00.000Z'
const doc = {
  schema: 1,
  meta: { title: 'A sample life', created, modified: created },
  tags,
  events: events.sort((a, b) => a.start - b.start),
  rows,
  views: [],
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(doc, null, 1)}\n`)

const ongoing = events.filter((e) => e.ongoing).length
const instants = events.filter((e) => e.end === e.start && !e.ongoing).length
console.log(`Wrote ${events.length} events across ${rows.length} rows to ${outPath}`)
console.log(`  ${ongoing} ongoing · ${instants} instantaneous · ${tags.length} tags`)
