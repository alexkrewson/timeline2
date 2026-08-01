/** Document schema (§8.1). All times are integer days, day 0 = 1970-01-01. */

export const SCHEMA_VERSION = 3

export type StyleChannel = 'fill' | 'saturation' | 'stripe' | 'outline'

export type Tag = {
  id: string
  label: string
  color: string
  parent: string | null
  /**
   * Which visual channel this tag drives (§8.2). `fill` tags are selection
   * tags; the rest are modifiers and must never share a channel with each
   * other — one channel, one meaning.
   */
  styleChannel: StyleChannel
}

export type EventSource = 'personal' | 'corpus'

export type TimelineEvent = {
  id: string
  label: string
  /** Integer day. */
  start: number
  /** Integer day, inclusive. `end === start` is instantaneous. `end >= start` always. */
  end: number
  /** When true, `end` is recomputed as today at render time (§7.4). */
  ongoing: boolean
  tags: string[]
  note: string
  /**
   * Per-event fill override (§8.3). Null means "use the tag colour", which is
   * the normal case. Set, it wins over both the tag colour and any row-level
   * colour variation.
   */
  color: string | null
  /** Reserved for v2 fuzzy dates, in days. Unused in v1 (§3.4). */
  startPrecision: number | null
  endPrecision: number | null
  source: EventSource
}

export type CorpusEvent = TimelineEvent & {
  /** 0–1, normalized within the corpus. Corpus data only — personal events carry no rating. */
  significance: number
  topics: string[]
  /** Reserved: Wikidata Q-id, so a future pipeline lands as an import, not a migration. */
  entityId: string | null
  url: string
}

export type RecMode = 'off' | 'prefer-matching' | 'prefer-enclosing'

export type RowSource =
  | { kind: 'tag'; tagIds: string[] }
  | { kind: 'corpus'; mode: RecMode; maxRows: number; topics?: string[] }

export type RowConfig = {
  id: string
  label: string
  source: RowSource
  /**
   * `single` keeps everything in one lane, sub-banding overlaps.
   * `auto` first-fits into as few lanes as possible.
   * `per-event` gives every event its own lane even when they'd share one —
   * for rows whose entries are people, where "one person, one line" reads
   * better than saving vertical space.
   */
  packing: 'single' | 'auto' | 'per-event'
  /** Soft cap; spilling past it is allowed and flagged. */
  maxLanes: number
  minSubBandPx: number
  /** px, per lane. */
  height: number
  layer: 'stack' | 'backdrop'
  /**
   * Give each event in this row its own palette colour instead of sharing the
   * tag's. A view property, not data: in a single-tag row the tag colour is
   * redundant anyway — the row label already says it — so varying the fill
   * carries more information than repeating it.
   */
  varyColors: boolean
  pinned: boolean
  sort: 'start'
  order: number
  visible: boolean
}

export type SavedView = {
  id: string
  label: string
  rowIds: string[]
  camera: { logScale: number; leftDay: number } | Record<string, never>
}

export type TimelineDoc = {
  schema: number
  meta: {
    title: string
    created: string
    modified: string
    /**
     * Day of birth. When set, the axis carries an age scale above the calendar
     * one — on a personal timeline "how old was I" is often the actual
     * question. Null means no age axis.
     */
    birthDay: number | null
  }
  tags: Tag[]
  events: TimelineEvent[]
  rows: RowConfig[]
  views: SavedView[]
}

export function isCorpusEvent(e: TimelineEvent): e is CorpusEvent {
  return e.source === 'corpus'
}
