/**
 * Model → pixel layout. Shared by the live chart and the export renderer so an
 * exported SVG is the same computation, not a second implementation.
 */

import { packRow, type PackedRow } from '../model/packing'
import { eventsForRow, type RowContext } from '../model/rows'
import type { RowConfig, TimelineEvent } from '../model/types'

export const LANE_GAP = 2
export const MIN_BAR_PX = 3

export type RowLayout = {
  row: RowConfig
  events: TimelineEvent[]
  packed: PackedRow
  laneHeight: number
  /** Total row height in px, including inter-lane gaps. */
  height: number
  /** y of a lane's top, relative to the row. */
  laneTop: (lane: number) => number
}

export function layoutRow(row: RowConfig, ctx: RowContext): RowLayout {
  const events = eventsForRow(row, ctx)
  const laneHeight = row.height
  const packed = packRow(events, {
    laneHeight,
    minSubBandPx: row.minSubBandPx,
    maxLanes: row.maxLanes,
    packing: row.packing,
    today: ctx.today,
  })
  const lanes = Math.max(1, packed.laneCount)
  return {
    row,
    events,
    packed,
    laneHeight,
    height: lanes * laneHeight + (lanes - 1) * LANE_GAP,
    laneTop: (lane) => lane * (laneHeight + LANE_GAP),
  }
}

export function layoutRows(rows: RowConfig[], ctx: RowContext): RowLayout[] {
  return rows.map((r) => layoutRow(r, ctx))
}

/** First start day in a row, used as the stable secondary sort key for FLIP. */
export function firstStart(layout: RowLayout): number {
  return layout.events.length ? layout.events[0].start : Number.MAX_SAFE_INTEGER
}

/** Bar x-extent in pixels, honouring the 3px minimum glyph width (§6.1). */
export function barExtent(
  start: number,
  endEx: number,
  toX: (day: number) => number,
): { x0: number; x1: number } {
  const x0 = toX(start)
  const x1 = toX(endEx)
  return { x0, x1: x1 - x0 < MIN_BAR_PX ? x0 + MIN_BAR_PX : x1 }
}

/** Viewport culling — never render off-screen events (§12). */
export function isVisible(x0: number, x1: number, width: number, margin = 200): boolean {
  return x1 >= -margin && x0 <= width + margin
}
