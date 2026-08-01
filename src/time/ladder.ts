/**
 * Nice-numbers tick ladder (§4.3).
 *
 * Tick spacing in *pixels* stays inside a target band; when it leaves the band
 * the ladder steps a rung and the labels reinterpret. Ticks below the
 * millennium rung are calendar-aligned (so unequal month lengths still land
 * correctly); above it they are arithmetic.
 *
 * Invariant: the band ratio (200/55 ≈ 3.64) must exceed the largest ratio
 * between adjacent rungs (3.5, at 2d→1w). Adding or removing a rung means
 * re-checking this — `ladder.test.ts` asserts it.
 */

import { DAYS_PER_YEAR, daysFromCivil, civilFromDays } from './days'

export const MIN_TICK_PX = 55
export const MAX_TICK_PX = 200

export type RungKind = 'day' | 'week' | 'month' | 'year' | 'arith'

export type Rung = {
  id: string
  /** Nominal spacing in days — what the px-band decision is made against. */
  days: number
  kind: RungKind
  /** Step size in the rung's own unit (days / weeks / months / years). */
  step: number
}

function y(n: number): Rung {
  return { id: yearId(n), days: n * DAYS_PER_YEAR, kind: n >= 1000 ? 'arith' : 'year', step: n }
}

function yearId(n: number): string {
  if (n >= 1e9) return `${trim(n / 1e9)}Gy`
  if (n >= 1e6) return `${trim(n / 1e6)}My`
  if (n >= 1e3) return `${trim(n / 1e3)}ky`
  return `${n}y`
}

function trim(n: number): string {
  return String(Number(n.toFixed(1)))
}

/** The ladder, ascending. Values below the year rung follow §4.3 exactly. */
export const LADDER: Rung[] = [
  { id: '1d', days: 1, kind: 'day', step: 1 },
  { id: '2d', days: 2, kind: 'day', step: 2 },
  { id: '1w', days: 7, kind: 'week', step: 1 },
  { id: '2w', days: 14, kind: 'week', step: 2 },
  { id: '1mo', days: 30.44, kind: 'month', step: 1 },
  { id: '1qtr', days: 91.3, kind: 'month', step: 3 },
  { id: '6mo', days: 182.6, kind: 'month', step: 6 },
  y(1),
  y(2),
  y(5),
  y(10),
  y(25),
  y(50),
  y(100),
  y(250),
  y(500),
  y(1_000),
  y(2_500),
  y(5_000),
  y(10_000),
  y(25_000),
  y(50_000),
  y(100_000),
  y(250_000),
  y(500_000),
  y(1_000_000),
  y(2_500_000),
  y(5_000_000),
  y(10_000_000),
  y(25_000_000),
  y(50_000_000),
  y(100_000_000),
  y(250_000_000),
  y(500_000_000),
  y(1_000_000_000),
  y(2_500_000_000),
  y(5_000_000_000),
]

/** Largest ratio between adjacent rungs. Must stay under MAX_TICK_PX/MIN_TICK_PX. */
export function maxAdjacentRatio(ladder: Rung[] = LADDER): number {
  let max = 0
  for (let i = 1; i < ladder.length; i++) max = Math.max(max, ladder[i].days / ladder[i - 1].days)
  return max
}

/**
 * The coarsest-necessary rung: the first whose pixel spacing reaches the band
 * floor. Clamped at both ends — outside the reachable zoom range (see
 * `MIN_PX_PER_DAY` / `MAX_PX_PER_DAY`) spacing can leave the band, which is why
 * the camera clamps scale rather than the ladder pretending to have more rungs.
 */
export function rungFor(pxPerDayValue: number): Rung {
  for (const rung of LADDER) {
    if (rung.days * pxPerDayValue >= MIN_TICK_PX) return rung
  }
  return LADDER[LADDER.length - 1]
}

export function tickSpacingPx(rung: Rung, pxPerDayValue: number): number {
  return rung.days * pxPerDayValue
}

export type Tick = {
  day: number
  /** Whether this tick starts a coarser unit (year boundary within a month rung, etc.). */
  major: boolean
}

const MONDAY_ANCHOR = -3 // 1969-12-29, the Monday before the epoch

/**
 * Tick days covering [startDay, endDay], calendar-aligned below the millennium
 * rung and arithmetic above it.
 */
export function ticksFor(rung: Rung, startDay: number, endDay: number, limit = 4096): Tick[] {
  const out: Tick[] = []
  if (!(endDay > startDay)) return out

  switch (rung.kind) {
    case 'day':
    case 'week': {
      const step = rung.kind === 'week' ? rung.step * 7 : rung.step
      const anchor = rung.kind === 'week' ? MONDAY_ANCHOR : 0
      let d = anchor + Math.ceil((startDay - anchor) / step) * step
      for (; d <= endDay && out.length < limit; d += step) {
        const c = civilFromDays(d)
        out.push({ day: d, major: c.m === 1 && c.d === 1 })
      }
      return out
    }
    case 'month': {
      const c = civilFromDays(Math.floor(startDay))
      let idx = c.y * 12 + (c.m - 1)
      idx = Math.floor(idx / rung.step) * rung.step
      for (let i = 0; out.length < limit; i++) {
        const mi = idx + i * rung.step
        const yr = Math.floor(mi / 12)
        const mo = mi - yr * 12 + 1
        const d = daysFromCivil(yr, mo, 1)
        if (d > endDay) break
        if (d >= startDay) out.push({ day: d, major: mo === 1 })
      }
      return out
    }
    case 'year': {
      const c = civilFromDays(Math.floor(startDay))
      let yr = Math.floor(c.y / rung.step) * rung.step
      for (; out.length < limit; yr += rung.step) {
        const d = daysFromCivil(yr, 1, 1)
        if (d > endDay) break
        if (d >= startDay) out.push({ day: d, major: yr % (rung.step * 10) === 0 })
      }
      return out
    }
    case 'arith': {
      const startYear = startDay / DAYS_PER_YEAR
      let yr = Math.floor(startYear / rung.step) * rung.step
      for (; out.length < limit; yr += rung.step) {
        const d = yr * DAYS_PER_YEAR
        if (d > endDay) break
        if (d >= startDay) out.push({ day: d, major: yr === 0 })
      }
      return out
    }
  }
}
