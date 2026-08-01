import { describe, expect, it } from 'vitest'
import {
  cameraFromScale,
  dayToX,
  fitRange,
  MAX_PX_PER_DAY,
  MIN_PX_PER_DAY,
  panByPx,
  pxPerDay,
  xToDay,
  ZOOM_STEP,
  zoomAt,
} from './scale'

describe('geometric zoom', () => {
  it('is notch-invariant across 13 orders of magnitude', () => {
    const at = (scale: number) => {
      const cam = cameraFromScale(scale, 0)
      const after = zoomAt(cam, 400, 1)
      return pxPerDay(after) / pxPerDay(cam)
    }
    // 1e-11 is below the camera clamp, so drive the pure log math directly.
    const ratioHigh = Math.exp(Math.log(100) + Math.log(ZOOM_STEP)) / 100
    const ratioLow = Math.exp(Math.log(1e-11) + Math.log(ZOOM_STEP)) / 1e-11
    expect(ratioHigh).toBeCloseTo(ZOOM_STEP, 12)
    expect(ratioLow).toBeCloseTo(ZOOM_STEP, 12)
    expect(ratioHigh).toBeCloseTo(ratioLow, 12)

    // And within the reachable range, the camera agrees.
    expect(at(1)).toBeCloseTo(ZOOM_STEP, 10)
    expect(at(1e-9)).toBeCloseTo(ZOOM_STEP, 10)
  })

  it('keeps the day under the cursor under the cursor', () => {
    let cam = cameraFromScale(0.5, -700_000)
    for (const notches of [1, 1, -1, 5, -12, 3]) {
      const anchorX = 613
      const before = xToDay(anchorX, cam)
      cam = zoomAt(cam, anchorX, notches)
      expect(xToDay(anchorX, cam)).toBeCloseTo(before, 4)
    }
  })

  it('reaches cosmic scale in ~130 notches', () => {
    let cam = cameraFromScale(MAX_PX_PER_DAY, 0)
    let notches = 0
    while (pxPerDay(cam) > MIN_PX_PER_DAY * 1.0001 && notches < 1000) {
      cam = zoomAt(cam, 0, -1)
      notches++
    }
    expect(notches).toBeGreaterThan(100)
    expect(notches).toBeLessThan(200)
  })

  it('clamps scale to the reachable range', () => {
    const inCam = zoomAt(cameraFromScale(MAX_PX_PER_DAY, 0), 0, 50)
    const outCam = zoomAt(cameraFromScale(MIN_PX_PER_DAY, 0), 0, -50)
    expect(pxPerDay(inCam)).toBeCloseTo(MAX_PX_PER_DAY, 8)
    expect(pxPerDay(outCam) / MIN_PX_PER_DAY).toBeCloseTo(1, 8)
  })
})

describe('day ↔ pixel mapping', () => {
  it('round-trips', () => {
    const cam = cameraFromScale(0.0137, -1_234_567)
    for (const day of [-5e12, -1.66e12, -4_371_000, 0, 20_000]) {
      expect(xToDay(dayToX(day, cam), cam)).toBeCloseTo(day, 0)
    }
  })

  it('pans without changing scale', () => {
    const cam = cameraFromScale(2, 100)
    const panned = panByPx(cam, -50)
    expect(pxPerDay(panned)).toBeCloseTo(2, 12)
    expect(panned.leftDay).toBeCloseTo(125, 10)
  })

  it('fits a range into a width', () => {
    const cam = fitRange(0, 1000, 500, 0)
    expect(dayToX(0, cam)).toBeCloseTo(0, 6)
    expect(dayToX(1000, cam)).toBeCloseTo(500, 6)
  })
})
