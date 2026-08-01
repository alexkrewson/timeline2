/**
 * Pan and zoom (§4.1). Zoom is anchored at the cursor: the day under the
 * pointer stays under the pointer, at every scale.
 *
 * Ctrl/⌘+wheel and pinch both map to the same geometric zoom. Plain wheel is
 * left alone so vertical scrolling stays native on both platforms.
 */

import { useEffect, type RefObject } from 'react'
import { getCameraState, cancelCameraAnimation, setCamera } from '../state/camera'
import { markPanned } from '../render/panGuard'
import { panByPx, zoomAt } from '../time/scale'

type Options = {
  /** Left edge of the plot area in client coordinates. */
  plotLeft: () => number
}

export function usePanZoom(ref: RefObject<HTMLElement | null>, { plotLeft }: Options): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const anchor = (clientX: number) => clientX - plotLeft()

    const onWheel = (e: WheelEvent) => {
      // A trackpad pinch arrives as ctrlKey + wheel; so does ⌘/ctrl + wheel.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        cancelCameraAnimation()
        const notches = -e.deltaY / 100
        setCamera(zoomAt(getCameraState().cam, anchor(e.clientX), notches))
        return
      }
      // Horizontal intent — shift+wheel, or a trackpad's own x axis.
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      if (Math.abs(dx) > 0 && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        e.preventDefault()
        cancelCameraAnimation()
        setCamera(panByPx(getCameraState().cam, -dx))
      }
      // Plain vertical wheel falls through to native scrolling.
    }

    // --- drag to pan, pinch to zoom ---
    const points = new Map<number, { x: number; y: number }>()
    let pinchDist = 0
    let pinchMid = 0
    let dragging = false

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      if ((e.target as HTMLElement).closest('[data-no-pan]')) return
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (points.size === 2) {
        const [a, b] = [...points.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchMid = anchor((a.x + b.x) / 2)
        dragging = false
      } else if (points.size === 1) {
        dragging = true
        el.setPointerCapture(e.pointerId)
      }
      cancelCameraAnimation()
    }

    const onPointerMove = (e: PointerEvent) => {
      const prev = points.get(e.pointerId)
      if (!prev) return
      points.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (points.size === 2) {
        const [a, b] = [...points.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0 && dist > 0) {
          const cam = getCameraState().cam
          const notches = Math.log(dist / pinchDist) / Math.log(1.2)
          setCamera(zoomAt(cam, pinchMid, notches))
        }
        pinchDist = dist
        pinchMid = anchor((a.x + b.x) / 2)
        e.preventDefault()
        return
      }

      if (!dragging) return
      const dx = e.clientX - prev.x
      if (Math.abs(dx) > 0) {
        el.classList.add('is-panning')
        markPanned()
        setCamera(panByPx(getCameraState().cam, dx))
      }
    }

    const endPointer = (e: PointerEvent) => {
      points.delete(e.pointerId)
      if (points.size < 2) pinchDist = 0
      if (points.size === 0) {
        dragging = false
        el.classList.remove('is-panning')
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
    }
  }, [ref, plotLeft])
}
