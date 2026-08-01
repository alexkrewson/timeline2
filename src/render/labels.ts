/**
 * Label placement (§6). Labels are harder than bars.
 *
 * Order of preference for each bar:
 *   1. absorbed by the row gutter — only when unambiguous (§6.3)
 *   2. inline, clamped to the viewport edge when the bar starts off-screen (§6.2)
 *   3. an overflow lane above or below the row with a leader line (§6.4)
 *   4. dropped, when nothing collision-free is available
 *
 * The overflow lanes are a fixed allowance (`LABEL_PAD`) reserved on every row
 * whether used or not — a row whose height changed as labels came and went
 * would make the whole stack jitter during a pan.
 */

import type { PlacedEvent } from '../model/packing'
import { barExtent, type RowLayout } from './layout'
import { measureText, truncateToWidth } from './text'

export const LABEL_FONT_SIZE = 11
export const LABEL_PAD = 15
/** A bar thinner than this can't carry text at all. */
const MIN_LABEL_BAR_H = 11
/** Below this, an inline label would be pure ellipsis. */
const MIN_INLINE_W = 26
const OVERFLOW_LANE_H = 13

export type LabelKind = 'inline' | 'sticky' | 'overflow'

export type PlacedLabel = {
  eventId: string
  text: string
  kind: LabelKind
  x: number
  /** Baseline y, relative to the row's content top (may be negative). */
  y: number
  width: number
  leader?: { x1: number; y1: number; x2: number; y2: number }
}

export type LabelPlan = {
  /** Event label the gutter absorbed, e.g. gutter reads "era — Holocene". */
  gutterAbsorbed: string | null
  labels: PlacedLabel[]
  dropped: number
}

export type LabelOptions = {
  toX: (day: number) => number
  width: number
  /** 'all' places every label it can; 'sparse' skips overflow lanes entirely. */
  density?: 'all' | 'sparse'
}

type Box = { x0: number; x1: number }

function collides(box: Box, placed: Box[]): boolean {
  return placed.some((p) => box.x0 < p.x1 + 4 && p.x0 - 4 < box.x1)
}

/** Visible x-extent of a placed event, unioned across its segments. */
function extentOf(p: PlacedEvent, toX: (day: number) => number): { x0: number; x1: number } {
  const first = barExtent(p.segments[0].start, p.segments[0].endEx, toX)
  const last = barExtent(p.segments.at(-1)!.start, p.segments.at(-1)!.endEx, toX)
  return { x0: first.x0, x1: Math.max(last.x1, first.x1) }
}

/** The segment a label should sit in: the tallest one still on screen. */
function labelSegment(p: PlacedEvent, toX: (day: number) => number, width: number) {
  let best = p.segments[0]
  let bestH = -1
  for (const seg of p.segments) {
    const { x0, x1 } = barExtent(seg.start, seg.endEx, toX)
    if (x1 < 0 || x0 > width) continue
    if (seg.height > bestH) {
      bestH = seg.height
      best = seg
    }
  }
  return best
}

export function planLabels(layout: RowLayout, opts: LabelOptions): LabelPlan {
  const { toX, width } = opts
  const density = opts.density ?? 'all'
  const labels: PlacedLabel[] = []
  let dropped = 0

  const visible = layout.packed.placed.filter((p) => {
    const { x0, x1 } = extentOf(p, toX)
    return x1 >= 0 && x0 <= width
  })

  // §6.3 — the gutter absorbs a label only when there is no ambiguity about
  // which event it belongs to: one lane, one event, spanning the whole view.
  if (
    layout.packed.laneCount <= 1 &&
    visible.length === 1 &&
    layout.packed.placed.length >= 1
  ) {
    const { x0, x1 } = extentOf(visible[0], toX)
    if (x0 <= 0 && x1 >= width) {
      return { gutterAbsorbed: visible[0].event.label, labels: [], dropped: 0 }
    }
  }

  const overflowQueue: PlacedEvent[] = []

  for (const p of visible) {
    const text = p.event.label.trim()
    if (!text) continue
    const seg = labelSegment(p, toX, width)
    const { x0, x1 } = extentOf(p, toX)
    const laneTop = layout.laneTop(p.lane)
    const boxTop = laneTop + seg.top
    const boxH = seg.height

    if (boxH < MIN_LABEL_BAR_H) {
      overflowQueue.push(p)
      continue
    }

    // Sticky: a bar starting left of the viewport rides its label at the edge
    // and releases it when the true start scrolls back into view.
    const sticky = x0 < 0
    const anchorX = Math.max(4, x0 + 5)
    const avail = x1 - 5 - anchorX
    if (avail < MIN_INLINE_W) {
      overflowQueue.push(p)
      continue
    }

    const shown = truncateToWidth(text, avail, LABEL_FONT_SIZE)
    if (!shown) {
      overflowQueue.push(p)
      continue
    }
    labels.push({
      eventId: p.event.id,
      text: shown,
      kind: sticky ? 'sticky' : 'inline',
      x: anchorX,
      y: boxTop + boxH / 2 + LABEL_FONT_SIZE * 0.35,
      width: measureText(shown, LABEL_FONT_SIZE),
    })
  }

  if (density === 'sparse') {
    return { gutterAbsorbed: null, labels, dropped: overflowQueue.length }
  }

  // §6.4 — greedy collision avoidance, highest priority first. Priority is
  // visible width: the bar a reader is most likely asking about.
  const above: Box[] = []
  const below: Box[] = []
  const sorted = overflowQueue
    .map((p) => ({ p, ...extentOf(p, toX) }))
    .sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0) || a.x0 - b.x0)

  for (const { p, x0, x1 } of sorted) {
    const text = p.event.label.trim()
    if (!text) continue
    const w = Math.min(measureText(text, LABEL_FONT_SIZE), 180)
    const shown = truncateToWidth(text, w, LABEL_FONT_SIZE)
    const centre = (Math.max(0, x0) + Math.min(width, x1)) / 2
    const bx0 = Math.max(2, Math.min(width - w - 2, centre - w / 2))
    const box: Box = { x0: bx0, x1: bx0 + w }

    const seg = labelSegment(p, toX, width)
    const laneTop = layout.laneTop(p.lane)
    const anchorY = laneTop + seg.top + seg.height / 2

    let target: 'above' | 'below' | null = null
    if (!collides(box, above)) target = 'above'
    else if (!collides(box, below)) target = 'below'

    if (!target) {
      dropped++
      continue
    }
    ;(target === 'above' ? above : below).push(box)

    const y =
      target === 'above'
        ? -LABEL_PAD + OVERFLOW_LANE_H - 3
        : layout.height + OVERFLOW_LANE_H - 2
    labels.push({
      eventId: p.event.id,
      text: shown,
      kind: 'overflow',
      x: bx0,
      y,
      width: w,
      leader: {
        x1: Math.max(0, Math.min(width, centre)),
        y1: target === 'above' ? y + 3 : y - LABEL_FONT_SIZE,
        x2: Math.max(0, Math.min(width, centre)),
        y2: target === 'above' ? anchorY : anchorY,
      },
    })
  }

  return { gutterAbsorbed: null, labels, dropped }
}
