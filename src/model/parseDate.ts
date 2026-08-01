/**
 * Flexible date input (§7.3). Resolves partial dates differently in the start
 * and end fields — `2005` is 1 January in a start field and 31 December in an
 * end field — and echoes the resolved result in plain language so the user
 * confirms it before saving.
 *
 * Two negative-year conventions coexist deliberately:
 *   - a bare `-3000` is read the way a person means it: 3000 BCE
 *   - an ISO `-3000-01-01` is astronomical, per ISO 8601 (= 3001 BCE)
 * The echo line disambiguates either way.
 */

import {
  DAYS_PER_YEAR,
  daysFromCivil,
  daysInMonth,
  endOfMonthDay,
  endOfYearDay,
  todayDay,
} from '../time/days'
import { formatDayLong } from '../time/format'

export type DateRole = 'start' | 'end'
export type Granularity = 'day' | 'month' | 'year' | 'deep'

export type ParsedDate = {
  day: number
  granularity: Granularity
  /** Plain-language echo, e.g. "1 March 2012". */
  echo: string
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function monthFromName(name: string): number | null {
  const n = name.toLowerCase()
  if (n.length < 3) return null
  const idx = MONTHS.findIndex((m) => m.startsWith(n) || n.startsWith(m))
  return idx === -1 ? null : idx + 1
}

/** Human-facing bare-year input → astronomical year. `-3000` means 3000 BCE. */
function bareYearToAstronomical(n: number): number {
  return n < 0 ? n + 1 : n
}

/** "3000 BCE" → astronomical -2999. */
function eraYearToAstronomical(n: number, era: string | undefined): number {
  if (!era) return bareYearToAstronomical(n)
  const e = era.toLowerCase()
  if (e === 'bce' || e === 'bc') return 1 - Math.abs(n)
  return Math.abs(n)
}

function resolve(
  day: number,
  granularity: Granularity,
): ParsedDate {
  return { day, granularity, echo: formatDayLong(day) }
}

function yearDay(year: number, role: DateRole): ParsedDate {
  return resolve(role === 'end' ? endOfYearDay(year) : daysFromCivil(year, 1, 1), 'year')
}

function monthDay(year: number, month: number, role: DateRole): ParsedDate {
  return resolve(role === 'end' ? endOfMonthDay(year, month) : daysFromCivil(year, month, 1), 'month')
}

const DEEP_UNITS: Record<string, number> = {
  kya: 1e3, ka: 1e3,
  mya: 1e6, ma: 1e6,
  gya: 1e9, ga: 1e9, bya: 1e9,
}

export function parseFlexibleDate(input: string, role: DateRole): ParsedDate | null {
  const raw = input.trim()
  if (!raw) return null
  const s = raw.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()

  if (s === 'today' || s === 'now') return resolve(todayDay(), 'day')

  // Deep time: "13.8 gya", "540 mya", "12 kya"
  const deep = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(kya|ka|mya|ma|gya|ga|bya)$/)
  if (deep) {
    const yearsAgo = Number(deep[1]) * DEEP_UNITS[deep[2]]
    const year = 1970 - yearsAgo
    return resolve(Math.round(year * DAYS_PER_YEAR), 'deep')
  }

  // ISO-ish: 2012-03-03, 2012-03, -0044-03-15 (astronomical years)
  const iso = s.match(/^(-?\d{1,10})-(\d{1,2})(?:-(\d{1,2}))?$/)
  if (iso) {
    const y = Number(iso[1])
    const m = clampMonth(Number(iso[2]))
    if (iso[3] === undefined) return monthDay(y, m, role)
    return resolve(civilDay(y, m, clampDay(Number(iso[3]))), 'day')
  }

  // Slash: 3/3/2012, 12/2005
  const slash3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(-?\d{1,10})$/)
  if (slash3) {
    const a = Number(slash3[1])
    const b = Number(slash3[2])
    const y = bareYearToAstronomical(Number(slash3[3]))
    // Day-first only when the first field can't be a month; otherwise US month-first.
    const [m, d] = a > 12 ? [b, a] : [a, b]
    return resolve(civilDay(y, clampMonth(m), clampDay(d)), 'day')
  }
  const slash2 = s.match(/^(\d{1,2})\/(-?\d{1,10})$/)
  if (slash2) {
    return monthDay(bareYearToAstronomical(Number(slash2[2])), clampMonth(Number(slash2[1])), role)
  }

  // Month-name forms: "mar 2012", "3 mar 2012", "mar 3 2012", "march 2012 bce"
  const words = s.split(' ')
  const monthWordIdx = words.findIndex((w) => /^[a-z]+$/.test(w) && monthFromName(w) !== null)
  if (monthWordIdx !== -1) {
    const month = monthFromName(words[monthWordIdx])!
    const rest = words.filter((_, i) => i !== monthWordIdx)
    const era = rest.find((w) => /^(bce|bc|ce|ad)$/.test(w))
    const nums = rest.filter((w) => /^-?\d+$/.test(w)).map(Number)
    if (nums.length === 1) {
      // A lone number next to a month name is a year unless it can't be one.
      const n = nums[0]
      if (Math.abs(n) > 31 || era) return monthDay(eraYearToAstronomical(n, era), month, role)
      return monthDay(new Date().getFullYear(), month, role)
    }
    if (nums.length >= 2) {
      const [a, b] = nums
      const [day, year] = Math.abs(a) > 31 ? [b, a] : [a, b]
      return resolve(
        civilDay(eraYearToAstronomical(year, era), month, clampDay(day)),
        'day',
      )
    }
    return monthDay(new Date().getFullYear(), month, role)
  }

  // Bare year, optionally with an era: "2005", "-3000", "3000 bce"
  const bare = s.match(/^(-?\d{1,10})(?:\s*(bce|bc|ce|ad))?$/)
  if (bare) {
    return yearDay(eraYearToAstronomical(Number(bare[1]), bare[2]), role)
  }

  return null
}

function clampMonth(m: number): number {
  return Math.min(12, Math.max(1, Math.round(m)))
}

function clampDay(d: number): number {
  return Math.min(31, Math.max(1, Math.round(d)))
}

/** Day-of-month clamped to the real month length, so "feb 31" isn't March 3. */
function civilDay(y: number, m: number, d: number): number {
  return daysFromCivil(y, m, Math.min(d, daysInMonth(y, m)))
}
