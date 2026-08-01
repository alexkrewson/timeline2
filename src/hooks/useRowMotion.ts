/**
 * Row insertion motion (§11).
 *
 * FLIP for rows that land inside the viewport, scroll anchoring plus an edge
 * chip for rows that land outside it. Anchoring on its own solves
 * disorientation and creates a new problem — the user has no idea anything
 * happened — so the two always ship together.
 *
 * Offsets are measured against the scroll content (`offsetTop`), not the
 * viewport, so a scroll between renders can't invalidate the previous
 * measurement.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const GAP_MS = 200
const FADE_MS = 150
const CHIP_MS = 4000

export type EdgeChipState = { count: number; dir: 'up' | 'down'; targetId: string } | null

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useRowMotion(
  scrollRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  rowIds: string[],
  /** Set when a single search hit should be scrolled to instead of anchored. */
  scrollToRowId?: string | null,
) {
  const prevOffsets = useRef(new Map<string, number>())
  const [chip, setChip] = useState<EdgeChipState>(null)
  const chipTimer = useRef<number | null>(null)

  const dismissChip = useCallback(() => {
    setChip(null)
    if (chipTimer.current) window.clearTimeout(chipTimer.current)
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return

    const nodes = new Map<string, HTMLElement>()
    content.querySelectorAll<HTMLElement>('[data-row-id]').forEach((n) => {
      nodes.set(n.dataset.rowId!, n)
    })

    const next = new Map<string, number>()
    for (const [id, node] of nodes) next.set(id, node.offsetTop)

    const prev = prevOffsets.current
    const isFirstRun = prev.size === 0
    prevOffsets.current = next
    if (isFirstRun) return

    const viewTop = scroller.scrollTop
    const viewBottom = viewTop + scroller.clientHeight

    // Anchor on the topmost row that was visible and still exists.
    let anchorId: string | null = null
    let anchorPrev = Infinity
    for (const [id, top] of prev) {
      if (!next.has(id)) continue
      if (top >= viewTop - 1 && top < anchorPrev) {
        anchorPrev = top
        anchorId = id
      }
    }

    let scrollDelta = 0
    const explicitTarget = scrollToRowId && next.has(scrollToRowId)
    if (anchorId && !explicitTarget) {
      scrollDelta = next.get(anchorId)! - prev.get(anchorId)!
      if (scrollDelta !== 0) scroller.scrollTop = viewTop + scrollDelta
    }

    const skipMotion = reducedMotion()
    const added: string[] = []
    let addedAbove = 0
    let addedBelow = 0
    let firstAddedAbove: string | null = null
    let firstAddedBelow: string | null = null

    for (const [id, node] of nodes) {
      const before = prev.get(id)
      const after = next.get(id)!
      const inView = after >= viewTop + scrollDelta - 8 && after <= viewBottom + scrollDelta + 8

      if (before === undefined) {
        added.push(id)
        if (!inView) {
          if (after < viewTop + scrollDelta) {
            addedAbove++
            firstAddedAbove ??= id
          } else {
            addedBelow++
            firstAddedBelow ??= id
          }
          continue
        }
        if (skipMotion) continue
        // Fade in only *after* the gap has finished opening — fading during the
        // move makes it impossible to tell what moved from what appeared.
        node.style.opacity = '0'
        window.setTimeout(() => {
          node.style.transition = `opacity ${FADE_MS}ms ease`
          node.style.opacity = '1'
          window.setTimeout(() => {
            node.style.transition = ''
            node.style.opacity = ''
          }, FADE_MS + 30)
        }, GAP_MS)
        continue
      }

      const dy = before - (after - scrollDelta)
      if (dy === 0 || skipMotion || !inView) continue

      node.style.transition = 'none'
      node.style.transform = `translateY(${dy}px)`
      requestAnimationFrame(() => {
        node.style.transition = `transform ${GAP_MS}ms ease`
        node.style.transform = ''
        window.setTimeout(() => {
          node.style.transition = ''
        }, GAP_MS + 30)
      })
    }

    if (explicitTarget) {
      // A single explicit hit should not preserve position — go to it (§11.3).
      nodes.get(scrollToRowId)?.scrollIntoView({
        block: 'center',
        behavior: skipMotion ? 'auto' : 'smooth',
      })
    } else if (addedAbove + addedBelow > 0) {
      const dir = addedAbove >= addedBelow ? 'up' : 'down'
      setChip({
        count: addedAbove + addedBelow,
        dir,
        targetId: (dir === 'up' ? firstAddedAbove : firstAddedBelow) ?? added[0],
      })
      if (chipTimer.current) window.clearTimeout(chipTimer.current)
      chipTimer.current = window.setTimeout(() => setChip(null), CHIP_MS)
    }
  }, [rowIds.join('|'), scrollRef, contentRef, scrollToRowId])

  useEffect(() => () => {
    if (chipTimer.current) window.clearTimeout(chipTimer.current)
  }, [])

  const scrollToRow = useCallback(
    (id: string) => {
      contentRef.current
        ?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
      dismissChip()
    },
    [contentRef, dismissChip],
  )

  return { chip, dismissChip, scrollToRow }
}
