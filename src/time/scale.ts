/**
 * Geometric zoom and the day↔pixel mapping (§4.1).
 *
 * Scale is `pxPerDay`, held internally as its natural log so a scroll notch is
 * always the same proportional change — one notch feels identical at day scale
 * and at billion-year scale.
 */

import { DAYS_PER_YEAR } from './days'
import { LADDER, MAX_TICK_PX, MIN_TICK_PX } from './ladder'

/** Multiplier per scroll notch. */
export const ZOOM_STEP = 1.2

/**
 * Reachable zoom range, derived from the ladder ends and the spacing band so
 * tick spacing can never escape 55–200px anywhere the camera can go (§4.3).
 */
export const MAX_PX_PER_DAY = MAX_TICK_PX / LADDER[0].days
export const MIN_PX_PER_DAY = MIN_TICK_PX / LADDER[LADDER.length - 1].days

export type Camera = {
  /** ln(pxPerDay). */
  logScale: number
  /** Day at x = 0 of the chart surface. */
  leftDay: number
}

export function pxPerDay(cam: Camera): number {
  return Math.exp(cam.logScale)
}

export function cameraFromScale(scale: number, leftDay: number): Camera {
  return { logScale: Math.log(scale), leftDay }
}

export function clampScale(scale: number): number {
  return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, scale))
}

export function dayToX(day: number, cam: Camera): number {
  return (day - cam.leftDay) * pxPerDay(cam)
}

export function xToDay(x: number, cam: Camera): number {
  return cam.leftDay + x / pxPerDay(cam)
}

export function viewSpanDays(cam: Camera, widthPx: number): number {
  return widthPx / pxPerDay(cam)
}

export function viewRange(cam: Camera, widthPx: number): { start: number; end: number } {
  return { start: cam.leftDay, end: cam.leftDay + viewSpanDays(cam, widthPx) }
}

/**
 * Zoom by `notches` (positive = in), keeping the day under `anchorX` fixed.
 * Pure multiply in log space — invariant at every scale.
 */
export function zoomAt(cam: Camera, anchorX: number, notches: number, step = ZOOM_STEP): Camera {
  const anchorDay = xToDay(anchorX, cam)
  const next = clampScale(Math.exp(cam.logScale + notches * Math.log(step)))
  return { logScale: Math.log(next), leftDay: anchorDay - anchorX / next }
}

/** Zoom to an exact scale while holding `anchorX` fixed. */
export function zoomToScaleAt(cam: Camera, anchorX: number, scale: number): Camera {
  const anchorDay = xToDay(anchorX, cam)
  const next = clampScale(scale)
  return { logScale: Math.log(next), leftDay: anchorDay - anchorX / next }
}

/** Pan by a pixel delta. Positive `dx` moves content right (view moves earlier). */
export function panByPx(cam: Camera, dx: number): Camera {
  return { ...cam, leftDay: cam.leftDay - dx / pxPerDay(cam) }
}

/** Camera that frames [startDay, endDay] in `widthPx`, with optional padding. */
export function fitRange(
  startDay: number,
  endDay: number,
  widthPx: number,
  padFraction = 0.04,
): Camera {
  const span = Math.max(1, endDay - startDay)
  const padded = span * (1 + padFraction * 2)
  const scale = clampScale(widthPx / padded)
  return { logScale: Math.log(scale), leftDay: startDay - span * padFraction }
}

/** Interpolate between cameras in log space so preset transitions read as continuous. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    logScale: a.logScale + (b.logScale - a.logScale) * t,
    leftDay: a.leftDay + (b.leftDay - a.leftDay) * t,
  }
}

export const PRESETS = [
  { id: 'day', label: 'Day', days: 1 },
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30.44 },
  { id: 'year', label: 'Year', days: DAYS_PER_YEAR },
  { id: 'decade', label: 'Decade', days: 10 * DAYS_PER_YEAR },
  { id: 'century', label: 'Century', days: 100 * DAYS_PER_YEAR },
  { id: 'millennium', label: 'Millennium', days: 1_000 * DAYS_PER_YEAR },
  { id: 'epoch', label: 'Epoch', days: 100_000 * DAYS_PER_YEAR },
  { id: 'geological', label: 'Geological', days: 500_000_000 * DAYS_PER_YEAR },
  { id: 'cosmic', label: 'Cosmic', days: 14_000_000_000 * DAYS_PER_YEAR },
] as const

export type PresetId = (typeof PRESETS)[number]['id']

/** Scale at which the viewport spans roughly one unit of the given preset. */
export function presetScale(preset: PresetId, widthPx: number): number {
  const p = PRESETS.find((x) => x.id === preset)!
  return clampScale(widthPx / p.days)
}

/** Preset whose span is closest to the current viewport, for highlighting. */
export function nearestPreset(cam: Camera, widthPx: number): PresetId {
  const span = viewSpanDays(cam, widthPx)
  let best: PresetId = PRESETS[0].id
  let bestErr = Infinity
  for (const p of PRESETS) {
    const err = Math.abs(Math.log(p.days / span))
    if (err < bestErr) {
      bestErr = err
      best = p.id
    }
  }
  return best
}
