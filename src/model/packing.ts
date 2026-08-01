/**
 * Lane assignment and the overlap sweep (§5.2).
 *
 * Within a lane, overlapping bars split the lane height vertically instead of
 * colliding. A bar is therefore a polygon, not a rectangle — its height may
 * step several times across its span. Sub-band order is by start date
 * ascending, top first, and is stable: an earlier event stays above a later one
 * through every segment they share.
 */

import { effectiveEnd } from './doc'
import type { TimelineEvent } from './types'

/** Vertical extent over a day interval, relative to the top of its lane. */
export type Segment = {
  /** Inclusive start day. */
  start: number
  /** Exclusive end day. */
  endEx: number
  top: number
  height: number
}

export type PlacedEvent = {
  event: TimelineEvent
  /** Effective span, with `ongoing` already resolved. */
  start: number
  end: number
  lane: number
  segments: Segment[]
}

export type PackedRow = {
  laneCount: number
  placed: PlacedEvent[]
  /** True when lanes exceeded `maxLanes`. Flagged, never an error (§5.2). */
  spilled: boolean
  /** Events pushed out of their preferred lane by the min-sub-band rule. */
  spillCount: number
}

export type PackOptions = {
  laneHeight: number
  minSubBandPx: number
  maxLanes: number
  packing: 'single' | 'auto' | 'per-event'
  today: number
}

type Span = { ev: TimelineEvent; start: number; endEx: number }

function toSpans(events: TimelineEvent[], today: number): Span[] {
  return events
    .map((ev) => ({ ev, start: ev.start, endEx: effectiveEnd(ev, today) + 1 }))
    .sort((a, b) => a.start - b.start || (a.ev.id < b.ev.id ? -1 : 1))
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.endEx && b.start < a.endEx
}

/**
 * Sweep one lane. Returns segments per span, plus any spans evicted because a
 * sub-band would have fallen below `minSubBandPx`.
 */
function sweepLane(
  spans: Span[],
  laneHeight: number,
  minSubBandPx: number,
): { segments: Map<string, Segment[]>; evicted: Span[] } {
  const maxBands = Math.max(1, Math.floor(laneHeight / minSubBandPx))
  const evicted: Span[] = []
  let working = spans

  // Evict until no interval is more crowded than the lane can represent.
  for (let guard = 0; guard < spans.length + 1; guard++) {
    const worst = busiestInterval(working)
    if (worst.length <= maxBands) break
    // Lowest priority within the crowded interval: the latest start.
    const victim = worst[worst.length - 1]
    evicted.push(victim)
    working = working.filter((s) => s !== victim)
  }

  return { segments: sweepSegments(working, laneHeight), evicted }
}

/** The active set of the most crowded interval, in sub-band order. */
function busiestInterval(spans: Span[]): Span[] {
  let worst: Span[] = []
  forEachInterval(spans, (_lo, _hi, active) => {
    if (active.length > worst.length) worst = active.slice()
  })
  return worst
}

/**
 * Walk boundaries left to right. Each interval between consecutive boundaries
 * has a fixed active set, kept in start order (so appends stay sorted).
 */
function forEachInterval(
  spans: Span[],
  visit: (lo: number, hi: number, active: Span[]) => void,
): void {
  if (spans.length === 0) return
  const boundaries = new Set<number>()
  for (const s of spans) {
    boundaries.add(s.start)
    boundaries.add(s.endEx)
  }
  const points = [...boundaries].sort((a, b) => a - b)

  let next = 0
  let active: Span[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i]
    active = active.filter((s) => s.endEx > lo)
    while (next < spans.length && spans[next].start <= lo) {
      if (spans[next].endEx > lo) active.push(spans[next])
      next++
    }
    if (active.length > 0) visit(lo, points[i + 1], active)
  }
}

function sweepSegments(spans: Span[], laneHeight: number): Map<string, Segment[]> {
  const out = new Map<string, Segment[]>()
  for (const s of spans) out.set(s.ev.id, [])

  forEachInterval(spans, (lo, hi, active) => {
    const band = laneHeight / active.length
    active.forEach((s, k) => {
      const list = out.get(s.ev.id)!
      const top = k * band
      const last = list[list.length - 1]
      if (last && last.endEx === lo && last.top === top && last.height === band) {
        last.endEx = hi // merge — keeps polygons cheap
      } else {
        list.push({ start: lo, endEx: hi, top, height: band })
      }
    })
  })
  return out
}

/** Greedy first-fit: each event into the first lane where nothing overlaps it. */
function firstFitLanes(spans: Span[]): Span[][] {
  const lanes: Span[][] = []
  for (const s of spans) {
    let placed = false
    for (const lane of lanes) {
      if (!lane.some((o) => overlaps(o, s))) {
        lane.push(s)
        placed = true
        break
      }
    }
    if (!placed) lanes.push([s])
  }
  return lanes
}

export function packRow(events: TimelineEvent[], opts: PackOptions): PackedRow {
  const spans = toSpans(events, opts.today)
  if (spans.length === 0) return { laneCount: 0, placed: [], spilled: false, spillCount: 0 }

  const initial: Span[][] =
    opts.packing === 'auto'
      ? firstFitLanes(spans)
      : opts.packing === 'per-event'
        ? // One lane each, in start order — no sub-banding, no sharing.
          spans.map((s) => [s])
        : [spans]

  const placed: PlacedEvent[] = []
  const queue = [...initial]
  let laneIndex = 0
  let spillCount = 0

  while (queue.length > 0 && laneIndex < 512) {
    const laneSpans = queue.shift()!
    if (laneSpans.length === 0) continue
    const { segments, evicted } = sweepLane(laneSpans, opts.laneHeight, opts.minSubBandPx)

    for (const s of laneSpans) {
      if (evicted.includes(s)) continue
      placed.push({
        event: s.ev,
        start: s.start,
        end: s.endEx - 1,
        lane: laneIndex,
        segments: segments.get(s.ev.id) ?? [],
      })
    }

    if (evicted.length > 0) {
      spillCount += evicted.length
      // Evicted events go to the next lane, ahead of any lanes still queued.
      queue.unshift(evicted.sort((a, b) => a.start - b.start))
    }
    laneIndex++
  }

  return {
    laneCount: laneIndex,
    placed,
    spilled: laneIndex > opts.maxLanes,
    spillCount,
  }
}

/** Polygon points for a placed event, in pixel space. */
export function segmentsToPolygon(
  segments: Segment[],
  laneTop: number,
  toX: (day: number) => number,
  minWidthPx = 3,
): string {
  if (segments.length === 0) return ''
  const top: Array<[number, number]> = []
  const bottom: Array<[number, number]> = []

  for (const seg of segments) {
    let x0 = toX(seg.start)
    let x1 = toX(seg.endEx)
    // Minimum glyph width (§6.1) — without it, a one-day event at century zoom
    // is a fraction of a pixel and silently disappears.
    if (x1 - x0 < minWidthPx) x1 = x0 + minWidthPx
    const y0 = laneTop + seg.top
    const y1 = y0 + seg.height
    top.push([x0, y0], [x1, y0])
    bottom.push([x0, y1], [x1, y1])
  }
  bottom.reverse()
  return [...top, ...bottom].map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
