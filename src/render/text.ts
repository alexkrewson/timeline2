/** Text measurement, shared by the live chart and the export renderer. */

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

function context(): CanvasRenderingContext2D | null {
  if (ctx) return ctx
  if (typeof document === 'undefined') return null
  ctx = document.createElement('canvas').getContext('2d')
  return ctx
}

export function measureText(text: string, fontSize: number, weight = 500): number {
  const key = `${weight}|${fontSize}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const c = context()
  // Fallback estimate keeps layout sane in non-DOM contexts (tests, SSR).
  const width = c
    ? ((c.font = `${weight} ${fontSize}px ${FONT_STACK}`), c.measureText(text).width)
    : text.length * fontSize * 0.55
  cache.set(key, width)
  return width
}

/** Longest prefix of `text` that fits `maxWidth`, with an ellipsis when clipped. */
export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (maxWidth <= 0) return ''
  if (measureText(text, fontSize) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measureText(`${text.slice(0, mid)}…`, fontSize) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : ''
}
