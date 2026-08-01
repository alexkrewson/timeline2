/**
 * Camera lives outside React state: it changes every animation frame during a
 * pan or zoom, and only the chart needs to re-render when it does.
 */

import { useSyncExternalStore } from 'react'
import {
  cameraFromScale,
  clampScale,
  fitRange,
  lerpCamera,
  presetScale,
  zoomToScaleAt,
  type Camera,
  type PresetId,
} from '../time/scale'
import { todayDay } from '../time/days'

export type CameraState = { cam: Camera; width: number }

const listeners = new Set<() => void>()

const today = todayDay()
let state: CameraState = {
  cam: cameraFromScale(clampScale(0.06), today - 12_000),
  width: 900,
}

function emit() {
  for (const l of listeners) l()
}

export function getCameraState(): CameraState {
  return state
}

export function setCameraState(next: CameraState | ((p: CameraState) => CameraState)): void {
  const value = typeof next === 'function' ? next(state) : next
  if (value === state) return
  state = value
  emit()
}

export function setCamera(cam: Camera): void {
  setCameraState((s) => ({ ...s, cam }))
}

export function setChartWidth(width: number): void {
  // A zero measurement (pre-layout, display:none, a non-layout test host) would
  // collapse the view range and make every event look full-width. Keep the last
  // good value instead.
  if (!(width > 0)) return
  setCameraState((s) => (Math.abs(s.width - width) < 0.5 ? s : { ...s, width }))
}

export function useCameraState(): CameraState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getCameraState,
    getCameraState,
  )
}

const PRESET_MS = 300

let animation = 0

export function cancelCameraAnimation(): void {
  if (animation) cancelAnimationFrame(animation)
  animation = 0
}

/** Animate to a target camera in log space so the motion reads as continuous. */
export function animateCamera(target: Camera, ms = PRESET_MS): void {
  cancelCameraAnimation()
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || ms <= 0) {
    setCamera(target)
    return
  }
  const from = state.cam
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    const eased = t * (2 - t) // ease-out
    setCamera(lerpCamera(from, target, eased))
    if (t < 1) animation = requestAnimationFrame(step)
    else animation = 0
  }
  animation = requestAnimationFrame(step)
}

/** Jump to a preset span, holding the centre of the viewport. */
export function applyPreset(preset: PresetId): void {
  const { cam, width } = state
  const target = zoomToScaleAt(cam, width / 2, presetScale(preset, width))
  animateCamera(target)
}

export function frameRange(startDay: number, endDay: number, animate = true): void {
  const target = fitRange(startDay, endDay, state.width)
  if (animate) animateCamera(target)
  else setCamera(target)
}
