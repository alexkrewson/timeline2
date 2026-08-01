/**
 * Human-readable rendering of day numbers. Civil dates only inside the civil
 * window and below the millennium rung; years-only arithmetic above (§3.3).
 */

import {
  DAYS_PER_YEAR,
  civilFromDays,
  isCivilDay,
  unitSystemFor,
  type UnitSystem,
} from './days'
import type { Rung } from './ladder'

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Astronomical year → display. Year 0 is 1 BCE. */
export function formatYear(astronomicalYear: number): string {
  const y = Math.round(astronomicalYear)
  if (y > 0) return String(y)
  return `${1 - y} BCE`
}

/** Deep-time year label: "2.5 Gya", "540 Mya", "12 kya", falling back to BCE/CE. */
export function formatDeepYear(astronomicalYear: number): string {
  const yearsAgo = 1970 - astronomicalYear
  const abs = Math.abs(yearsAgo)
  if (abs >= 1e9) return `${round(yearsAgo / 1e9)} Gya`
  if (abs >= 1e6) return `${round(yearsAgo / 1e6)} Mya`
  if (abs >= 20_000) return `${round(yearsAgo / 1e3)} kya`
  return formatYear(astronomicalYear)
}

function round(n: number): string {
  const a = Math.abs(n)
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return Number(n.toFixed(digits)).toLocaleString('en-US')
}

/** Full plain-language date, e.g. "1 March 2012" or "3000 BCE". Used by the form echo. */
export function formatDayLong(day: number): string {
  if (!isCivilDay(day)) return formatDeepYear(day / DAYS_PER_YEAR)
  const c = civilFromDays(day)
  return `${c.d} ${MONTHS_LONG[c.m - 1]} ${formatYear(c.y)}`
}

/** Compact date for chips and bar tooltips, e.g. "1 Mar 2012". */
export function formatDayShort(day: number): string {
  if (!isCivilDay(day)) return formatDeepYear(day / DAYS_PER_YEAR)
  const c = civilFromDays(day)
  return `${c.d} ${MONTHS_SHORT[c.m - 1]} ${formatYear(c.y)}`
}

/** ISO-ish date for export metadata and file contents. Civil window only. */
export function formatDayIso(day: number): string {
  if (!isCivilDay(day)) return String(day)
  const c = civilFromDays(day)
  const sign = c.y < 0 ? '-' : ''
  const yy = String(Math.abs(c.y)).padStart(4, '0')
  return `${sign}${yy}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
}

/** Label for an axis tick at the given rung. */
export function formatTick(day: number, rung: Rung): string {
  const system: UnitSystem = unitSystemFor(rung.days, day)
  if (system === 'arithmetic') return formatDeepYear(day / DAYS_PER_YEAR)

  const c = civilFromDays(day)
  switch (rung.kind) {
    case 'day':
    case 'week':
      return c.m === 1 && c.d === 1
        ? `1 Jan ${formatYear(c.y)}`
        : `${c.d} ${MONTHS_SHORT[c.m - 1]}`
    case 'month':
      return c.m === 1 ? `${MONTHS_SHORT[0]} ${formatYear(c.y)}` : MONTHS_SHORT[c.m - 1]
    default:
      return formatYear(c.y)
  }
}

/** Coarser context line under the tick row, e.g. the year while showing months. */
export function tickContext(day: number, rung: Rung): string | null {
  if (unitSystemFor(rung.days, day) === 'arithmetic') return null
  const c = civilFromDays(day)
  if (rung.kind === 'day' || rung.kind === 'week') return formatYear(c.y)
  if (rung.kind === 'month' && rung.step === 1) return formatYear(c.y)
  return null
}

/** Duration in the largest sensible unit: "3 days", "5 months", "1.2 Gy". */
export function formatDuration(days: number): string {
  const d = Math.max(1, Math.round(days))
  if (d === 1) return '1 day'
  if (d < 45) return `${d} days`
  const months = d / 30.44
  if (months < 22) return `${Number(months.toFixed(1))} months`
  const years = d / DAYS_PER_YEAR
  if (years < 1000) return `${Number(years.toFixed(years < 10 ? 1 : 0))} years`
  if (years < 1e6) return `${Number((years / 1e3).toFixed(1))} ky`
  if (years < 1e9) return `${Number((years / 1e6).toFixed(1))} My`
  return `${Number((years / 1e9).toFixed(2))} Gy`
}
