/**
 * Bar styling (§8.2). Tags do two jobs and must not be conflated:
 * selection tags decide which row an event lands in; modifier tags change how
 * an existing bar renders. Modifiers occupy independent visual channels — one
 * channel, one meaning — and the non-fill channels are shape-based, so no
 * distinction depends on hue alone.
 */

import type { Tag, TimelineEvent } from '../model/types'
import { TAG_PALETTE } from '../styles/themes'

export type BarStyle = {
  fill: string
  /** styleChannel 'saturation' — e.g. "dormant". */
  desaturated: boolean
  /** styleChannel 'stripe' — e.g. "partner". An underline stripe inside the bar. */
  stripe: boolean
  /** styleChannel 'outline' — a dashed outline. */
  outline: boolean
  /** Modifier tag labels, for the tooltip and the legend. */
  modifiers: string[]
}

export const DEFAULT_BAR_FILL = '#6b5230'
/** Corpus events carry no personal tags, so they get their own quiet fill. */
export const CORPUS_FILL = '#5c6b7a'

/**
 * Fill precedence, strongest first (§8.3):
 *   1. the event's own colour override
 *   2. the row's colour variation, if the row asked for it
 *   3. the first fill-channel tag's colour
 *   4. a neutral fallback
 *
 * The modifier channels are unaffected by any of this — saturation, stripe and
 * outline still mean exactly what their tags say, whatever the fill is.
 */
export function styleFor(
  event: TimelineEvent,
  tagsById: Map<string, Tag>,
  variant?: number | null,
): BarStyle {
  const base = barStyle(
    event,
    tagsById,
    event.source === 'corpus' ? CORPUS_FILL : DEFAULT_BAR_FILL,
  )
  if (event.color) return { ...base, fill: event.color }
  if (variant != null) return { ...base, fill: TAG_PALETTE[variant % TAG_PALETTE.length] }
  return base
}

export function barStyle(
  event: TimelineEvent,
  tagsById: Map<string, Tag>,
  fallbackFill = DEFAULT_BAR_FILL,
): BarStyle {
  let fill: string | null = null
  let desaturated = false
  let stripe = false
  let outline = false
  const modifiers: string[] = []

  for (const id of event.tags) {
    const tag = tagsById.get(id)
    if (!tag) continue
    switch (tag.styleChannel) {
      case 'fill':
        fill ??= tag.color
        break
      case 'saturation':
        desaturated = true
        modifiers.push(tag.label)
        break
      case 'stripe':
        stripe = true
        modifiers.push(tag.label)
        break
      case 'outline':
        outline = true
        modifiers.push(tag.label)
        break
    }
  }

  return { fill: fill ?? fallbackFill, desaturated, stripe, outline, modifiers }
}

/** Mix a hex colour toward grey, for the dormancy channel. */
export function desaturate(hex: string, amount = 0.6): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const mix = (c: number) => Math.round(c + (grey - c) * amount)
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`
}

/** Readable text colour for a fill, per the 4.5:1 rule in the shared style guide. */
export function textOn(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return '#14100a'
  const n = parseInt(m[1], 16)
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  const onDark = (lum + 0.05) / 0.05
  const onLight = 1.05 / (lum + 0.05)
  return onDark >= onLight ? '#14100a' : '#f5ece0'
}
