/**
 * Label placement (§6). Labels are harder than bars.
 *
 * Every label — inline or floating — competes for space in a single greedy
 * pass against one shared set of occupied boxes. An earlier version only
 * collision-checked the floating ones, so two inline labels in adjacent
 * sub-bands, or two in the same band a few pixels apart, drew straight over
 * each other.
 *
 * Candidates are tried in priority order (widest visible bar first — the bar a
 * reader is most likely asking about), and each takes the first option that
 * fits:
 *   1. absorbed by the row gutter — only when unambiguous (§6.3)
 *   2. inline, clamped to the viewport edge when the bar starts off-screen (§6.2)
 *   3. a floating lane above or below the row, with a leader line (§6.4)
 *   4. dropped — reported in `dropped` so the row can say so rather than
 *      quietly looking like there is nothing there
 *
 * The floating lanes are a fixed allowance (`LABEL_PAD`) reserved on every row
 * whether used or not — a row whose height changed as labels came and went
 * would make the whole stack jitter during a pan. Reserving it on both sides
 * also means one row's floating labels can never reach into its neighbour's.
 */

import type { PlacedEvent } from '../model/packing'
import { barExtent, type RowLayout } from './layout'
import { measureText, truncateToWidth } from './text'

export const LABEL_FONT_SIZE = 11
const LINE_H = 13
/** Floating lanes on each side of a row. */
const LANES_PER_SIDE = 2
export const LABEL_PAD = LANES_PER_SIDE * LINE_H + 2

/**
 * A band shorter than this can't carry text. It must exceed the font size with
 * room to spare: at 11px font in an 11px band the glyphs are taller than their
 * own band, so neighbouring sub-bands collide even though each "fits".
 */
const MIN_LABEL_BAR_H = LABEL_FONT_SIZE + 3
/** Below this, an inline label would be pure ellipsis. */
const MIN_INLINE_W = 26
/** Widest a floating label is allowed to get. */
const MAX_FLOAT_W = 180

const GAP_X = 4
const GAP_Y = 1

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
  /** Labels with nowhere collision-free to go. The bar still renders. */
  dropped: number
}

export type LabelOptions = {
  toX: (day: number) => number
  width: number
  /** 'all' places every label it can; 'sparse' skips the floating lanes. */
  density?: 'all' | 'sparse'
}

type Box = { x0: number; x1: number; y0: number; y1: number }

function hits(a: Box, b: Box): boolean {
  return (
    a.x0 < b.x1 + GAP_X && b.x0 < a.x1 + GAP_X && a.y0 < b.y1 + GAP_Y && b.y0 < a.y1 + GAP_Y
  )
}

/** Box a line of text occupies around its baseline. */
function textBox(x: number, baselineY: number, w: number): Box {
  return { x0: x, x1: x + w, y0: baselineY - LABEL_FONT_SIZE * 0.85, y1: baselineY + LABEL_FONT_SIZE * 0.3 }
}

/** Baselines of the floating lanes, nearest the row first. */
function laneBaselines(rowHeight: number): { y: number; side: 'above' | 'below' }[] {
  const out: { y: number; side: 'above' | 'below' }[] = []
  for (let i = 0; i < LANES_PER_SIDE; i++) {
    out.push({ y: -4 - i * LINE_H, side: 'above' })
    out.push({ y: rowHeight + 12 + i * LINE_H, side: 'below' })
  }
  // Try the lane nearest the row on each side before stepping outwards.
  return out.sort((a, b) => laneRank(a, rowHeight) - laneRank(b, rowHeight))
}

function laneRank(lane: { y: number; side: 'above' | 'below' }, rowHeight: number): number {
  const distance = lane.side === 'above' ? -lane.y : lane.y - rowHeight
  return distance * 2 + (lane.side === 'below' ? 1 : 0)
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
  const occupied: Box[] = []
  let dropped = 0

  const visible = layout.packed.placed.filter((p) => {
    const { x0, x1 } = extentOf(p, toX)
    return x1 >= 0 && x0 <= width
  })

  // §6.3 — the gutter absorbs a label only when there is no ambiguity about
  // which event it belongs to: one lane, one event, spanning the whole view.
  if (layout.packed.laneCount <= 1 && visible.length === 1 && layout.packed.placed.length >= 1) {
    const { x0, x1 } = extentOf(visible[0], toX)
    if (x0 <= 0 && x1 >= width) {
      return { gutterAbsorbed: visible[0].event.label, labels: [], dropped: 0 }
    }
  }

  const lanes = laneBaselines(layout.height)

  // Widest visible bar first — it has the strongest claim on inline space, and
  // the narrow bars it displaces are the ones that read fine on a leader line.
  const candidates = visible
    .map((p) => {
      const { x0, x1 } = extentOf(p, toX)
      return { p, x0, x1, visibleW: Math.min(width, x1) - Math.max(0, x0) }
    })
    .sort((a, b) => b.visibleW - a.visibleW || a.x0 - b.x0)

  for (const { p, x0, x1 } of candidates) {
    const text = p.event.label.trim()
    if (!text) continue

    const seg = labelSegment(p, toX, width)
    const bandTop = layout.laneTop(p.lane) + seg.top
    const anchorY = bandTop + seg.height / 2

    // 1. Inline, if the band is tall enough and the bar wide enough.
    if (seg.height >= MIN_LABEL_BAR_H) {
      const sticky = x0 < 0
      const anchorX = Math.max(4, x0 + 5)
      const avail = x1 - 5 - anchorX
      if (avail >= MIN_INLINE_W) {
        const shown = truncateToWidth(text, avail, LABEL_FONT_SIZE)
        if (shown) {
          const w = measureText(shown, LABEL_FONT_SIZE)
          const baseline = anchorY + LABEL_FONT_SIZE * 0.35
          const box = textBox(anchorX, baseline, w)
          if (!occupied.some((b) => hits(box, b))) {
            occupied.push(box)
            labels.push({
              eventId: p.event.id,
              text: shown,
              kind: sticky ? 'sticky' : 'inline',
              x: anchorX,
              y: baseline,
              width: w,
            })
            continue
          }
        }
      }
    }

    if (density === 'sparse') {
      dropped++
      continue
    }

    // 2. A floating lane, nearest the row first.
    const w = Math.min(measureText(text, LABEL_FONT_SIZE), MAX_FLOAT_W)
    const shown = truncateToWidth(text, w, LABEL_FONT_SIZE)
    if (!shown) {
      dropped++
      continue
    }
    const actualW = measureText(shown, LABEL_FONT_SIZE)
    const centre = (Math.max(0, x0) + Math.min(width, x1)) / 2
    const bx0 = Math.max(2, Math.min(width - actualW - 2, centre - actualW / 2))

    let placedHere = false
    for (const lane of lanes) {
      const box = textBox(bx0, lane.y, actualW)
      if (occupied.some((b) => hits(box, b))) continue
      occupied.push(box)
      const anchorX = Math.max(0, Math.min(width, centre))
      labels.push({
        eventId: p.event.id,
        text: shown,
        kind: 'overflow',
        x: bx0,
        y: lane.y,
        width: actualW,
        leader: {
          x1: anchorX,
          y1: lane.side === 'above' ? lane.y + 3 : lane.y - LABEL_FONT_SIZE,
          x2: anchorX,
          y2: anchorY,
        },
      })
      placedHere = true
      break
    }
    if (!placedHere) dropped++
  }

  return { gutterAbsorbed: null, labels, dropped }
}
