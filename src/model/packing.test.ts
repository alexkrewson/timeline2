import { describe, expect, it } from 'vitest'
import { makeEvent } from './doc'
import { packRow, segmentsToPolygon, type PackOptions } from './packing'
import type { TimelineEvent } from './types'

const OPTS: PackOptions = {
  laneHeight: 30,
  minSubBandPx: 8,
  maxLanes: 4,
  packing: 'single',
  today: 0,
}

function ev(label: string, start: number, end: number): TimelineEvent {
  return makeEvent({ label, start, end })
}

/** Every distinct vertical band an event occupies. */
function bands(row: ReturnType<typeof packRow>, label: string) {
  return row.placed.find((p) => p.event.label === label)!.segments
}

describe('sweep algorithm', () => {
  it('gives a lone event the full lane height', () => {
    const row = packRow([ev('a', 0, 100)], OPTS)
    expect(row.laneCount).toBe(1)
    expect(bands(row, 'a')).toEqual([{ start: 0, endEx: 101, top: 0, height: 30 }])
    expect(row.spilled).toBe(false)
  })

  it('splits a lane between two overlapping events and restores full height after', () => {
    const row = packRow([ev('a', 0, 100), ev('b', 50, 200)], OPTS)
    expect(row.laneCount).toBe(1)
    expect(bands(row, 'a')).toEqual([
      { start: 0, endEx: 50, top: 0, height: 30 },
      { start: 50, endEx: 101, top: 0, height: 15 },
    ])
    expect(bands(row, 'b')).toEqual([
      { start: 50, endEx: 101, top: 15, height: 15 },
      { start: 101, endEx: 201, top: 0, height: 30 },
    ])
  })

  it('steps a bar through three simultaneous overlaps', () => {
    const row = packRow([ev('a', 0, 300), ev('b', 100, 300), ev('c', 200, 300)], OPTS)
    const a = bands(row, 'a')
    expect(a.map((s) => s.height)).toEqual([30, 15, 10])
    expect(a.every((s) => s.top === 0)).toBe(true) // earliest stays on top throughout
    expect(bands(row, 'c')).toEqual([{ start: 200, endEx: 301, top: 20, height: 10 }])
    expect(row.laneCount).toBe(1)
  })

  it('keeps sub-band order stable by start date, earliest on top', () => {
    const row = packRow([ev('late', 10, 100), ev('early', 0, 100), ev('mid', 5, 100)], OPTS)
    const tops = ['early', 'mid', 'late'].map((l) => bands(row, l).at(-1)!.top)
    expect(tops).toEqual([...tops].sort((x, y) => x - y))
    // and no event ever moves above an earlier-starting one mid-span
    for (const seg of bands(row, 'mid')) expect(seg.top).toBeGreaterThan(0)
  })

  it('spills when a sub-band would fall below minSubBandPx', () => {
    // 30px lane / 8px minimum = at most 3 sub-bands.
    const row = packRow([ev('a', 0, 100), ev('b', 0, 100), ev('c', 0, 100), ev('d', 0, 100)], OPTS)
    expect(row.laneCount).toBe(2)
    expect(row.spillCount).toBe(1)
    // The latest start is the one that moves; here they tie, so the last by id order.
    expect(row.placed.filter((p) => p.lane === 0)).toHaveLength(3)
    expect(row.placed.filter((p) => p.lane === 1)).toHaveLength(1)
    for (const p of row.placed) {
      for (const seg of p.segments) expect(seg.height).toBeGreaterThanOrEqual(8)
    }
  })

  it('handles 12 simultaneous overlaps, flagging the soft cap without erroring', () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, i, 500))
    const row = packRow(events, OPTS)
    expect(row.placed).toHaveLength(12)
    expect(row.laneCount).toBe(4) // 3 per lane at 30px/8px
    expect(row.spilled).toBe(false) // exactly at maxLanes
    for (const p of row.placed) {
      for (const seg of p.segments) expect(seg.height).toBeGreaterThanOrEqual(8)
    }

    const tight = packRow(events, { ...OPTS, maxLanes: 2 })
    expect(tight.spilled).toBe(true) // flagged, never a hard error
    expect(tight.placed).toHaveLength(12)
  })

  it("treats packing:'auto' as one lane per non-overlapping group", () => {
    const row = packRow([ev('a', 0, 10), ev('b', 5, 20), ev('c', 30, 40)], {
      ...OPTS,
      packing: 'auto',
    })
    expect(row.laneCount).toBe(2)
    const byLabel = Object.fromEntries(row.placed.map((p) => [p.event.label, p.lane]))
    expect(byLabel.a).toBe(0)
    expect(byLabel.c).toBe(0)
    expect(byLabel.b).toBe(1)
    for (const p of row.placed) expect(p.segments[0].height).toBe(30)
  })

  it('treats an instantaneous event as one day wide', () => {
    const row = packRow([ev('point', 42, 42)], OPTS)
    expect(bands(row, 'point')).toEqual([{ start: 42, endEx: 43, top: 0, height: 30 }])
  })

  it('packs nothing without erroring', () => {
    expect(packRow([], OPTS)).toEqual({ laneCount: 0, placed: [], spilled: false, spillCount: 0 })
  })

  it('resolves ongoing events against today, not the stored end', () => {
    const ongoing = makeEvent({ label: 'now', start: 0, end: 5, ongoing: true })
    const row = packRow([ongoing], { ...OPTS, today: 900 })
    expect(row.placed[0].end).toBe(900)
    expect(row.placed[0].segments.at(-1)!.endEx).toBe(901)
  })
})

describe('polygon geometry', () => {
  it('enforces the 3px minimum glyph width', () => {
    const row = packRow([ev('tiny', 0, 0)], OPTS)
    const pts = segmentsToPolygon(row.placed[0].segments, 0, (d) => d * 0.0001)
      .split(' ')
      .map((p) => p.split(',').map(Number))
    const width = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))
    expect(width).toBeGreaterThanOrEqual(3)
  })

  it('emits a closed polygon that steps with the bands', () => {
    const row = packRow([ev('a', 0, 100), ev('b', 50, 200)], OPTS)
    const pts = segmentsToPolygon(bands(row, 'a'), 0, (d) => d)
    // 2 segments → 4 top points + 4 bottom points
    expect(pts.split(' ')).toHaveLength(8)
    expect(pts.startsWith('0,0 ')).toBe(true)
  })
})
