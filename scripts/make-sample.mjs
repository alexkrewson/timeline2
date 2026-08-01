/**
 * Generates the two sample documents in samples/.
 *
 *   sample-simple.timeline.json — a small, readable life. This is what the app's
 *     "Load sample" gives you: enough to see how rows, overlaps and ongoing
 *     events behave, with every label placed and nothing hidden.
 *
 *   sample-dense.timeline.json — a test fixture with a job, not a demo.
 *     Hand-made test data is too tidy: it never triggers the spill rule, never
 *     asks a 1-day bar to carry a 40-character label, never puts the same event
 *     in three rows. The label and packing tests run against this one.
 *
 * Everyone in both is invented.
 *
 * Run: node scripts/make-sample.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'samples')

function daysFromCivil(y, m, d) {
  const yy = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const D = (y, m = 1, d = 1) => daysFromCivil(y, m, d)

/** Seeded LCG — the fixtures must be byte-identical on every run. */
let seed = 20260801
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))

function builder() {
  let n = 0
  const events = []
  const id = (p) => `${p}_${(++n).toString(36).padStart(3, '0')}`

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
      color: null,
      startPrecision: null,
      endPrecision: null,
      source: 'personal',
      ...extra,
    })

  const row = (label, tagIds, extra = {}) => ({
    id: id('r'),
    label,
    source: { kind: 'tag', tagIds },
    packing: 'single',
    maxLanes: 4,
    minSubBandPx: 8,
    height: 30,
    layer: 'stack',
    varyColors: false,
    pinned: false,
    sort: 'start',
    order: 0,
    visible: true,
    ...extra,
  })

  return { events, ev, row }
}

const tag = (id, label, color, styleChannel = 'fill') => ({
  id,
  label,
  color,
  parent: null,
  styleChannel,
})

function write(name, title, tags, events, rows) {
  const created = '2026-08-01T00:00:00.000Z'
  const doc = {
    schema: 2,
    meta: { title, created, modified: created },
    tags,
    events: events.sort((a, b) => a.start - b.start),
    rows,
    views: [],
  }
  const path = join(outDir, name)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path, `${JSON.stringify(doc, null, 1)}\n`)
  const ongoing = events.filter((e) => e.ongoing).length
  console.log(`${name.padEnd(30)} ${String(events.length).padStart(3)} events, ${rows.length} rows, ${ongoing} ongoing`)
}

// ==========================================================================
// Simple — born 1986, two friends, three schools, three jobs.
// ==========================================================================
{
  const { events, ev, row } = builder()

  const tags = [
    tag('t_life', 'life', '#5a8460'),
    tag('t_school', 'school', '#8878a8'),
    tag('t_work', 'work', '#3d8c7a'),
    tag('t_friends', 'friends', '#6a8ca8'),
  ]

  // Instantaneous — also the smallest thing the renderer has to keep visible.
  ev('Born', D(1986, 5, 14), null, ['t_life'])

  // Three schools, contiguous through the usual ages.
  ev('Primary school', D(1992, 9, 1), D(1998, 6, 19), ['t_school'])
  ev('Secondary school', D(1998, 9, 1), D(2004, 6, 18), ['t_school'])
  ev('University', D(2004, 9, 27), D(2008, 6, 20), ['t_school'])

  // Three jobs, the last one still going.
  ev('First job — junior designer', D(2008, 9, 15), D(2013, 3, 29), ['t_work'])
  ev('Second job — studio lead', D(2013, 4, 15), D(2020, 1, 31), ['t_work'])
  ev('Third job — independent', D(2020, 2, 17), null, ['t_work'], { ongoing: true })

  // Two friends: met at 10 and at 20. Both still going, so they overlap each
  // other from 2006 on — the friends row splits its lane height there, which is
  // the clearest small demonstration of the sweep.
  ev('Sam — met at school, age 10', D(1996, 9, 3), null, ['t_friends'], { ongoing: true })
  ev('Rosa — met at university, age 20', D(2006, 10, 12), null, ['t_friends'], { ongoing: true })

  // varyColors on the rows whose entries are individuals rather than a
  // category: in a single-tag row the tag colour is redundant with the row
  // label, so one colour per entry says more than repeating the tag's.
  const rows = [
    row('life', ['t_life'], { order: 0, height: 24 }),
    row('school', ['t_school'], { order: 1, varyColors: true }),
    row('work', ['t_work'], { order: 2, varyColors: true }),
    row('friends', ['t_friends'], { order: 3, varyColors: true }),
  ]

  write('sample-simple.timeline.json', 'A simple life', tags, events, rows)
}

// ==========================================================================
// Dense — the stress fixture the label and packing tests run against.
// ==========================================================================
{
  const { events, ev, row } = builder()

  const tags = [
    tag('t_era', 'era', '#5a8460'),
    tag('t_home', 'home', '#b87040'),
    tag('t_school', 'school', '#8878a8'),
    tag('t_work', 'work', '#3d8c7a'),
    tag('t_friends', 'friends', '#6a8ca8'),
    tag('t_travel', 'travel', '#c49a6c'),
    tag('t_music', 'music', '#ac748c'),
    tag('t_health', 'health', '#9c6450'),
    tag('t_family', 'family', '#5a7898'),
    // Modifiers — independent channels, each legible without colour (§8.2).
    tag('t_dormant', 'dormant', '#8a7d68', 'saturation'),
    tag('t_partner', 'partner', '#ac748c', 'stripe'),
    tag('t_fuzzy', 'approximate', '#8a7d68', 'outline'),
  ]

  // eras: the pinned backdrop band, tiling without gaps
  ev('Childhood in Ohio', D(1988, 4, 2), D(2006, 8, 20), ['t_era'])
  ev('College years', D(2006, 8, 21), D(2010, 5, 15), ['t_era'])
  ev('The Chicago years', D(2010, 5, 16), D(2016, 9, 30), ['t_era'])
  ev('The Portland years', D(2016, 10, 1), D(2023, 4, 30), ['t_era'])
  ev('Van life', D(2023, 5, 1), D(2024, 6, 15), ['t_era'])
  ev('Back in Portland', D(2024, 6, 16), null, ['t_era'], { ongoing: true })

  // homes: deliberate 1–2 week move overlaps, so lanes sub-band
  ev('Maple Street, Dayton', D(1988, 4, 2), D(2001, 7, 14), ['t_home'])
  ev('Cedar Court, Dayton', D(2001, 7, 1), D(2006, 8, 25), ['t_home'])
  ev('Kerrey Hall (dorm)', D(2006, 8, 20), D(2007, 5, 20), ['t_home', 't_school'])
  ev('The Baltic Ave house', D(2007, 8, 25), D(2010, 5, 30), ['t_home'])
  ev('Logan Square studio', D(2010, 6, 1), D(2012, 9, 15), ['t_home'])
  ev('Humboldt Park 2-flat', D(2012, 9, 1), D(2016, 10, 8), ['t_home'])
  ev('SE Belmont apartment', D(2016, 10, 1), D(2020, 2, 29), ['t_home'])
  ev('The Alberta house', D(2020, 2, 15), D(2023, 5, 5), ['t_home'])
  ev('The van', D(2023, 5, 1), D(2024, 6, 20), ['t_home'])
  ev('N Killingsworth', D(2024, 6, 15), null, ['t_home'], { ongoing: true })

  ev('Fairview Elementary', D(1993, 8, 30), D(1999, 6, 4), ['t_school'])
  ev('Wright Middle School', D(1999, 8, 25), D(2002, 6, 6), ['t_school'])
  ev('Dayton Central High', D(2002, 8, 26), D(2006, 6, 3), ['t_school'])
  ev('BA, Urban Studies', D(2006, 8, 21), D(2010, 5, 15), ['t_school'])
  ev('Night classes — GIS certificate', D(2013, 9, 3), D(2014, 12, 12), ['t_school'])

  // work: overlapping main job + side work
  ev('Scooping ice cream at Grays', D(2004, 6, 1), D(2006, 8, 10), ['t_work'])
  ev('Campus library shelver', D(2007, 9, 4), D(2010, 5, 10), ['t_work'])
  ev('Planning intern, City of Chicago', D(2010, 6, 14), D(2011, 3, 31), ['t_work'])
  ev('Associate planner, Vela Group', D(2011, 4, 4), D(2016, 9, 23), ['t_work'])
  ev('Freelance mapping (side)', D(2013, 2, 1), D(2019, 8, 30), ['t_work'])
  ev('Senior planner, Cascade Civic', D(2016, 11, 7), D(2023, 4, 14), ['t_work'])
  ev('Consulting, self-employed', D(2023, 6, 1), null, ['t_work'], { ongoing: true })
  ev('Contract: transit study', D(2024, 1, 8), D(2024, 11, 22), ['t_work'])
  ev('Contract: county bike plan', D(2024, 9, 3), D(2025, 6, 30), ['t_work'])

  // family: instantaneous events, the 3px minimum glyph
  ev('Born', D(1988, 4, 2), null, ['t_family'])
  ev('Sister born', D(1991, 11, 19), null, ['t_family'])
  ev('Grandma Ruth died', D(2009, 3, 8), null, ['t_family'])
  ev('Parents divorced', D(1999, 6, 30), null, ['t_family'])
  ev('Married', D(2019, 9, 14), null, ['t_family'])
  ev('Dog — Biscuit', D(2017, 5, 20), null, ['t_family'], { ongoing: true })

  ev('Broken arm', D(1997, 8, 12), D(1997, 10, 3), ['t_health'])
  ev('Appendectomy', D(2014, 2, 27), null, ['t_health'])
  ev('Running consistently', D(2018, 1, 8), null, ['t_health'], { ongoing: true })
  ev('That long weird illness', D(2021, 11, 1), D(2022, 3, 1), ['t_health', 't_fuzzy'])

  ev('Piano lessons', D(1996, 9, 10), D(2003, 6, 1), ['t_music'])
  ev('Trumpet, school band', D(2000, 9, 5), D(2006, 6, 3), ['t_music'])
  ev('The Wednesday Nights (band)', D(2008, 2, 14), D(2011, 8, 20), ['t_music'])
  ev('Learning bass', D(2020, 4, 1), null, ['t_music'], { ongoing: true })
  ev('Choir', D(2015, 9, 1), D(2016, 9, 1), ['t_music', 't_dormant'])

  // friends: the spill trigger. Long, heavily overlapping spans.
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

  // travel: short bars with long labels — the overflow lane engine
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
  for (let i = 0; i < 12; i++) {
    const day = D(2022, 6, 1) + i * 2
    ev(`Scouting site ${i + 1}`, day, day, ['t_travel'])
  }

  ev('Something I never categorised', D(2013, 5, 1), D(2013, 8, 1), [])
  ev(
    'The summer everything happened at once',
    D(2016, 6, 1),
    D(2016, 9, 30),
    ['t_home', 't_work', 't_friends', 't_travel', 't_music', 't_health'],
  )

  const rows = [
    row('era', ['t_era'], { layer: 'backdrop', pinned: true, height: 22, order: 0 }),
    row('home', ['t_home'], { order: 1 }),
    row('school', ['t_school'], { order: 2 }),
    row('work', ['t_work'], { order: 3 }),
    row('friends', ['t_friends'], { order: 4, maxLanes: 6, height: 26, varyColors: true }),
    row('travel', ['t_travel'], { order: 5, height: 24 }),
    row('music', ['t_music'], { order: 6 }),
    row('health', ['t_health'], { order: 7 }),
    row('family', ['t_family'], { order: 8, height: 24 }),
  ]

  write('sample-dense.timeline.json', 'A sample life', tags, events, rows)
}
