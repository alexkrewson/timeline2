/**
 * Day arithmetic and proleptic Gregorian calendar conversion.
 *
 * Canonical unit is the integer day, day 0 = 1970-01-01. Never `Date`:
 * `Date` is float64 milliseconds and caps at ±273,790 years from epoch, which
 * deep-time views blow past silently. Integer days across 14 Gy is ~5.11e12,
 * exactly representable in float64 (safe integers reach 9.007e15).
 *
 * Years are astronomical: year 0 = 1 BCE, year -1 = 2 BCE.
 */

/** Mean Gregorian year. The conversion factor for arithmetic (non-civil) time. */
export const DAYS_PER_YEAR = 365.2425

/** Civil dates are only meaningful within this window; outside it we render years. */
export const CIVIL_WINDOW_YEARS = 10_000
export const CIVIL_MIN_DAY = -3_652_425 // ~10,000 years before epoch
export const CIVIL_MAX_DAY = 3_652_425 // ~10,000 years after epoch

export type Civil = { y: number; m: number; d: number }

/** True when `day` is inside the window where civil date conversion is offered. */
export function isCivilDay(day: number): boolean {
  return day >= CIVIL_MIN_DAY && day <= CIVIL_MAX_DAY
}

/**
 * Howard Hinnant's `days_from_civil`. Proleptic Gregorian all the way down —
 * no Julian switchover, no historical calendar reconstruction.
 */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400 // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1 // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy // [0, 146096]
  return era * 146097 + doe - 719468
}

/** Howard Hinnant's `civil_from_days`. Inverse of {@link daysFromCivil}. */
export function civilFromDays(day: number): Civil {
  const z = day + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097 // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  ) // [0, 399]
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153) // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9) // [1, 12]
  return { y: y + (m <= 2 ? 1 : 0), m, d }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeapYear(y) ? 29 : MONTH_LENGTHS[m - 1]
}

/** Day of the last day of the given month. */
export function endOfMonthDay(y: number, m: number): number {
  return daysFromCivil(y, m, daysInMonth(y, m))
}

export function endOfYearDay(y: number): number {
  return daysFromCivil(y, 12, 31)
}

/** 0 = Monday … 6 = Sunday. Day 0 (1970-01-01) was a Thursday. */
export function weekdayFromDay(day: number): number {
  return ((((day + 3) % 7) + 7) % 7)
}

/** Today as a day number, from the host clock. Only place a `Date` is read. */
export function todayDay(now: Date = new Date()): number {
  return daysFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/**
 * Approximate year for a day, used above the civil window where only the year
 * matters. Arithmetic, not calendrical — deliberately so (§3.3).
 */
export function yearFromDayArithmetic(day: number): number {
  return day / DAYS_PER_YEAR
}

export function dayFromYearArithmetic(year: number): number {
  return year * DAYS_PER_YEAR
}

/**
 * The architectural seam of §3.3: which unit system applies at this scale.
 * `civil` means real calendar months/days; `arithmetic` means years computed as
 * day / DAYS_PER_YEAR, with no calendar involved.
 */
export type UnitSystem = 'civil' | 'arithmetic'

/**
 * @param rungDays nominal spacing of the active tick rung, in days
 * @param day a day inside the current view
 */
export function unitSystemFor(rungDays: number, day: number): UnitSystem {
  if (!isCivilDay(day)) return 'arithmetic'
  // Coarser than the millennium rung is arithmetic even inside the civil window.
  if (rungDays >= 1000 * DAYS_PER_YEAR) return 'arithmetic'
  return 'civil'
}
