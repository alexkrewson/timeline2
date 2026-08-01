import { describe, expect, it } from 'vitest'
import { civilFromDays, DAYS_PER_YEAR, daysFromCivil } from './days'
import {
  LADDER,
  MAX_TICK_PX,
  MIN_TICK_PX,
  maxAdjacentRatio,
  rungFor,
  ticksFor,
  tickSpacingPx,
} from './ladder'
import { MAX_PX_PER_DAY, MIN_PX_PER_DAY, ZOOM_STEP } from './scale'

describe('ladder invariants', () => {
  it('is strictly ascending', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].days).toBeGreaterThan(LADDER[i - 1].days)
    }
  })

  it('never has an adjacency ratio exceeding the band ratio', () => {
    const bandRatio = MAX_TICK_PX / MIN_TICK_PX
    const worst = maxAdjacentRatio()
    expect(worst).toBeLessThan(bandRatio)
    expect(worst).toBeCloseTo(3.5, 6) // 2d → 1w, the tightest pair
  })

  it('keeps tick spacing inside 55–200px across a full day→cosmic sweep', () => {
    let scale = MAX_PX_PER_DAY
    let steps = 0
    while (scale >= MIN_PX_PER_DAY && steps < 5000) {
      const spacing = tickSpacingPx(rungFor(scale), scale)
      expect(spacing).toBeGreaterThanOrEqual(MIN_TICK_PX - 1e-9)
      expect(spacing).toBeLessThanOrEqual(MAX_TICK_PX + 1e-9)
      scale /= ZOOM_STEP
      steps++
    }
    expect(steps).toBeGreaterThan(100)
  })

  it('keeps spacing in band under a fine continuous sweep too', () => {
    const lo = Math.log(MIN_PX_PER_DAY)
    const hi = Math.log(MAX_PX_PER_DAY)
    for (let i = 0; i <= 4000; i++) {
      const scale = Math.exp(lo + ((hi - lo) * i) / 4000)
      const spacing = tickSpacingPx(rungFor(scale), scale)
      expect(spacing).toBeGreaterThanOrEqual(MIN_TICK_PX - 1e-9)
      expect(spacing).toBeLessThanOrEqual(MAX_TICK_PX + 1e-9)
    }
  })
})

describe('tick generation', () => {
  it('aligns day ticks to the day grid', () => {
    const ticks = ticksFor(LADDER[0], 10, 20)
    expect(ticks.map((t) => t.day)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  })

  it('aligns week ticks to Mondays', () => {
    const week = LADDER.find((r) => r.id === '1w')!
    for (const t of ticksFor(week, 0, 60)) {
      expect((((t.day + 3) % 7) + 7) % 7).toBe(0)
    }
  })

  it('aligns month ticks to real month starts, not 30.44-day multiples', () => {
    const mo = LADDER.find((r) => r.id === '1mo')!
    const start = daysFromCivil(2012, 1, 1)
    const ticks = ticksFor(mo, start, daysFromCivil(2013, 1, 1))
    expect(ticks).toHaveLength(13)
    ticks.forEach((t, i) => {
      const c = civilFromDays(t.day)
      expect(c.d).toBe(1)
      expect(c.m).toBe((i % 12) + 1)
    })
  })

  it('aligns quarter ticks to Jan/Apr/Jul/Oct', () => {
    const q = LADDER.find((r) => r.id === '1qtr')!
    for (const t of ticksFor(q, daysFromCivil(2000, 1, 1), daysFromCivil(2005, 1, 1))) {
      expect([1, 4, 7, 10]).toContain(civilFromDays(t.day).m)
    }
  })

  it('snaps year ticks to multiples of the step, including negative years', () => {
    const y25 = LADDER.find((r) => r.id === '25y')!
    for (const t of ticksFor(y25, daysFromCivil(-500, 1, 1), daysFromCivil(500, 1, 1))) {
      const c = civilFromDays(t.day)
      expect(c.m).toBe(1)
      expect(c.d).toBe(1)
      expect(Math.abs(c.y % 25)).toBe(0)
    }
  })

  it('uses arithmetic ticks above the millennium rung', () => {
    const my = LADDER.find((r) => r.id === '1My')!
    const ticks = ticksFor(my, -5e6 * DAYS_PER_YEAR, 0)
    expect(ticks.length).toBeGreaterThan(3)
    for (const t of ticks) {
      expect(Math.abs((t.day / DAYS_PER_YEAR) % 1e6)).toBeLessThan(1e-6)
    }
  })

  it('produces ticks covering the view at every rung', () => {
    for (const rung of LADDER) {
      const span = rung.days * 12
      const ticks = ticksFor(rung, -span / 2, span / 2)
      expect(ticks.length).toBeGreaterThan(6)
      expect(ticks.length).toBeLessThan(20)
    }
  })

  it('returns nothing for an empty range', () => {
    expect(ticksFor(LADDER[0], 5, 5)).toEqual([])
  })
})
