/**
 * Generates src/data/corpus.json from the hand-curated source list.
 *
 * The shipped file is spec-shaped (§9.1): the same event shape as a personal
 * event, plus significance / topics / entityId / url, with real integer day
 * numbers. The source list stays human-readable; this script does the arithmetic.
 *
 * `daysFromCivil` is duplicated from src/time/days.ts on purpose — a build
 * script that imported the app's TypeScript would need a whole toolchain to run.
 * It is twelve lines of pure function; the app's own tests are the source of truth.
 *
 * Run: node scripts/build-corpus.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENTRIES } from './corpus-source.mjs'

const DAYS_PER_YEAR = 365.2425
const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, '..', 'src', 'data', 'corpus.json')

function daysFromCivil(y, m, d) {
  const yy = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const daysInMonth = (y, m) => (m === 2 && isLeap(y) ? 29 : MONTH_LEN[m - 1])

const DEEP = { kya: 1e3, mya: 1e6, gya: 1e9 }

const today = (() => {
  const now = new Date()
  return daysFromCivil(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
})()

function parse(value, role) {
  const s = String(value).trim()
  if (s === 'now') return today

  const deep = /^([\d.]+)\s*(kya|Mya|Gya)$/i.exec(s)
  if (deep) {
    const yearsAgo = Number(deep[1]) * DEEP[deep[2].toLowerCase()]
    return Math.round((1970 - yearsAgo) * DAYS_PER_YEAR)
  }

  const bce = /^(\d+)\s*BCE$/i.exec(s)
  if (bce) {
    const y = 1 - Number(bce[1]) // astronomical: 3000 BCE = year -2999
    return role === 'end' ? daysFromCivil(y, 12, 31) : daysFromCivil(y, 1, 1)
  }

  const full = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(s)
  if (full) {
    const [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])]
    return daysFromCivil(y, m, Math.min(d, daysInMonth(y, m)))
  }

  const ym = /^(-?\d{1,6})-(\d{2})$/.exec(s)
  if (ym) {
    const [y, m] = [Number(ym[1]), Number(ym[2])]
    return role === 'end' ? daysFromCivil(y, m, daysInMonth(y, m)) : daysFromCivil(y, m, 1)
  }

  const year = /^(-?\d{1,6})$/.exec(s)
  if (year) {
    const y = Number(year[1])
    return role === 'end' ? daysFromCivil(y, 12, 31) : daysFromCivil(y, 1, 1)
  }

  throw new Error(`Unparseable corpus date: ${JSON.stringify(value)}`)
}

const slug = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

const seen = new Set()
const events = ENTRIES.map(([label, startRaw, endRaw, significance, topics]) => {
  let start = parse(startRaw, 'start')
  let end = parse(endRaw, 'end')
  if (end < start) [start, end] = [end, start]

  let id = `c_${slug(label)}`
  let n = 2
  while (seen.has(id)) id = `c_${slug(label)}-${n++}`
  seen.add(id)

  return {
    id,
    label,
    start,
    end,
    ongoing: false,
    tags: [],
    note: '',
    color: null,
    startPrecision: null,
    endPrecision: null,
    source: 'corpus',
    significance,
    topics,
    entityId: null, // reserved: Wikidata Q-id, so a future pipeline is an import
    url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(label)}`,
  }
}).sort((a, b) => a.start - b.start)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify({ schema: 2, events }, null, 1)}\n`)

const spans = events.map((e) => e.end - e.start + 1)
console.log(`Wrote ${events.length} corpus events to ${outPath}`)
console.log(
  `  range: day ${events[0].start.toExponential(3)} … ${events.at(-1).end}`,
  `\n  shortest ${Math.min(...spans)} day(s), longest ${Math.max(...spans).toExponential(3)} days`,
)
