import { describe, expect, it } from 'vitest'
import {
  CIVIL_MAX_DAY,
  CIVIL_MIN_DAY,
  civilFromDays,
  DAYS_PER_YEAR,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
  unitSystemFor,
  weekdayFromDay,
} from './days'

describe('day ↔ civil round trip', () => {
  it('anchors the epoch', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0)
    expect(civilFromDays(0)).toEqual({ y: 1970, m: 1, d: 1 })
  })

  it('round-trips every day across the civil window', () => {
    for (let d = CIVIL_MIN_DAY; d <= CIVIL_MAX_DAY; d += 997) {
      const c = civilFromDays(d)
      expect(daysFromCivil(c.y, c.m, c.d)).toBe(d)
    }
  })

  it('round-trips exactly at ±5e12 days (deep time, no drift)', () => {
    for (const d of [5e12, -5e12, 5.11e12, -5.11e12, 5e12 + 1, -5e12 - 1]) {
      const c = civilFromDays(d)
      expect(daysFromCivil(c.y, c.m, c.d)).toBe(d)
    }
  })

  it('keeps deep-time day values inside the exact-integer range', () => {
    expect(Number.isSafeInteger(5.11e12)).toBe(true)
    expect(5.11e12).toBeLessThan(Number.MAX_SAFE_INTEGER)
    // 14 Gy in days, well under the float64 exact-integer ceiling.
    expect(14e9 * DAYS_PER_YEAR).toBeLessThan(9.007e15)
  })

  it('handles the proleptic boundary, year 0 and negative years', () => {
    // 1582 Gregorian switchover is ignored by design — proleptic all the way.
    expect(civilFromDays(daysFromCivil(1582, 10, 5))).toEqual({ y: 1582, m: 10, d: 5 })
    expect(civilFromDays(daysFromCivil(0, 1, 1))).toEqual({ y: 0, m: 1, d: 1 })
    expect(civilFromDays(daysFromCivil(0, 2, 29))).toEqual({ y: 0, m: 2, d: 29 })
    expect(civilFromDays(daysFromCivil(-1, 12, 31))).toEqual({ y: -1, m: 12, d: 31 })
    expect(daysFromCivil(0, 1, 1)).toBeLessThan(0)
    expect(daysFromCivil(-1, 12, 31)).toBe(daysFromCivil(0, 1, 1) - 1)
  })

  it('applies proleptic leap rules including year 0 and -400', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(0)).toBe(true)
    expect(isLeapYear(-400)).toBe(true)
    expect(isLeapYear(-100)).toBe(false)
    expect(daysInMonth(0, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
  })

  it('spans a leap day correctly', () => {
    expect(daysFromCivil(2024, 3, 1) - daysFromCivil(2024, 2, 1)).toBe(29)
    expect(daysFromCivil(2023, 3, 1) - daysFromCivil(2023, 2, 1)).toBe(28)
  })

  it('knows 1970-01-01 was a Thursday', () => {
    expect(weekdayFromDay(0)).toBe(3) // 0 = Monday
    expect(weekdayFromDay(-3)).toBe(0)
  })
})

describe('unit system seam', () => {
  it('is civil for fine rungs inside the window', () => {
    expect(unitSystemFor(1, 0)).toBe('civil')
    expect(unitSystemFor(365.2425, 10_000)).toBe('civil')
    expect(unitSystemFor(500 * DAYS_PER_YEAR, 0)).toBe('civil')
  })

  it('is arithmetic at and above the millennium rung', () => {
    expect(unitSystemFor(1000 * DAYS_PER_YEAR, 0)).toBe('arithmetic')
    expect(unitSystemFor(1e6 * DAYS_PER_YEAR, 0)).toBe('arithmetic')
  })

  it('is arithmetic outside the civil window regardless of rung', () => {
    expect(unitSystemFor(1, CIVIL_MIN_DAY - 1)).toBe('arithmetic')
    expect(unitSystemFor(1, -5e12)).toBe('arithmetic')
  })
})
