/**
 * Row resolution: a row is a *view* over events, never a property of the data
 * (§2). The same event appears in every row whose filter matches it.
 */

import { recommend } from './recommend'
import type { CorpusEvent, RowConfig, TimelineDoc, TimelineEvent } from './types'

export type RowContext = {
  doc: TimelineDoc
  corpus: CorpusEvent[]
  viewStart: number
  viewEnd: number
  today: number
  /** Free-text/tag filters from the search panel; null = no filtering. */
  filter?: ((e: TimelineEvent) => boolean) | null
}

export function eventsForRow(row: RowConfig, ctx: RowContext): TimelineEvent[] {
  let events: TimelineEvent[]

  if (row.source.kind === 'tag') {
    const want = new Set(row.source.tagIds)
    events = want.size === 0 ? [] : ctx.doc.events.filter((e) => e.tags.some((t) => want.has(t)))
  } else {
    events = recommend(ctx.corpus, {
      viewStart: ctx.viewStart,
      viewEnd: ctx.viewEnd,
      mode: row.source.mode,
      maxRows: row.source.maxRows,
      topics: row.source.topics,
      today: ctx.today,
    }).map((s) => s.event)
  }

  if (ctx.filter) events = events.filter(ctx.filter)
  return events.slice().sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
}

/** Stable sort key both FLIP states agree on (§11.1): order, then first start. */
export function sortRows(rows: RowConfig[], firstStart: (row: RowConfig) => number): RowConfig[] {
  return rows
    .slice()
    .sort((a, b) => a.order - b.order || firstStart(a) - firstStart(b) || (a.id < b.id ? -1 : 1))
}

export function visibleRows(rows: RowConfig[]): RowConfig[] {
  return rows.filter((r) => r.visible)
}
