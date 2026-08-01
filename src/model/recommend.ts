/**
 * Duration-aware recommendation ranking (§9.3).
 *
 * Popularity alone is scale-blind: ranking 1969 by raw significance surfaces
 * the Cold War, the Vietnam War and the 20th century — enormous, enormously
 * popular, overlapping everything — so the same rows appear whether you're
 * looking at 1969 or 1953. Discounting by how the event's duration compares to
 * the viewport makes the results respond to position again.
 */

import { durationDays, overlapsRange } from './doc'
import type { CorpusEvent, RecMode } from './types'

/** The only tunable, per §9.3. */
export const DEFAULT_SIGMA = 1.0
const ENCLOSING_K = 1.5

export function durationFactor(r: number, mode: RecMode, sigma = DEFAULT_SIGMA): number {
  switch (mode) {
    case 'off':
      return 1
    case 'prefer-matching':
      return Math.exp(-((r / sigma) ** 2))
    case 'prefer-enclosing':
      return 1 / (1 + Math.exp(-(r - ENCLOSING_K)))
  }
}

export type Scored = { event: CorpusEvent; score: number; r: number }

export type RecommendOptions = {
  viewStart: number
  viewEnd: number
  mode: RecMode
  maxRows: number
  topics?: string[]
  sigma?: number
  today: number
}

export function recommend(corpus: CorpusEvent[], opts: RecommendOptions): Scored[] {
  const span = Math.max(1, opts.viewEnd - opts.viewStart)
  const topics = opts.topics?.length ? new Set(opts.topics) : null
  const out: Scored[] = []

  for (const event of corpus) {
    // Overlap, never "starts within" — otherwise long events are invisible from
    // anywhere inside their own duration (§9.2).
    if (!overlapsRange(event, opts.viewStart, opts.viewEnd, opts.today)) continue
    if (topics && !event.topics.some((t) => topics.has(t))) continue

    const r = Math.log10(durationDays(event, opts.today) / span)
    const score = event.significance * durationFactor(r, opts.mode, opts.sigma)
    out.push({ event, score, r })
  }

  out.sort((a, b) => b.score - a.score || a.event.start - b.event.start)
  return out.slice(0, Math.max(0, opts.maxRows))
}
