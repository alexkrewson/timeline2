/** Document construction, invariants, ids, and the migration chain (§8). */

import { daysFromCivil, todayDay } from '../time/days'
import {
  SCHEMA_VERSION,
  type RowConfig,
  type Tag,
  type TimelineDoc,
  type TimelineEvent,
} from './types'

let idCounter = 0

/** Stable, never reused within a session; random suffix keeps merges safe. */
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${idCounter.toString(36)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function emptyDoc(title = 'Untitled timeline'): TimelineDoc {
  const created = nowIso()
  return {
    schema: SCHEMA_VERSION,
    meta: { title, created, modified: created },
    tags: [],
    events: [],
    rows: [],
    views: [],
  }
}

export function makeTag(label: string, color: string, partial: Partial<Tag> = {}): Tag {
  return {
    id: newId('t'),
    label,
    color,
    parent: null,
    styleChannel: 'fill',
    ...partial,
  }
}

export function makeRow(label: string, partial: Partial<RowConfig> = {}): RowConfig {
  return {
    id: newId('r'),
    label,
    source: { kind: 'tag', tagIds: [] },
    packing: 'single',
    maxLanes: 4,
    minSubBandPx: 8,
    height: 30,
    layer: 'stack',
    pinned: false,
    sort: 'start',
    order: 0,
    visible: true,
    ...partial,
  }
}

export function makeEvent(partial: Partial<TimelineEvent> = {}): TimelineEvent {
  const start = partial.start ?? todayDay()
  return {
    id: newId('e'),
    label: '',
    start,
    end: partial.end ?? start,
    ongoing: false,
    tags: [],
    note: '',
    startPrecision: null,
    endPrecision: null,
    source: 'personal',
    ...partial,
  }
}

/** Enforce `end >= start` (§8.1). Swaps rather than rejecting — never hard-error on input. */
export function normalizeEvent(e: TimelineEvent): TimelineEvent {
  if (e.end >= e.start) return e
  return { ...e, start: e.end, end: e.start }
}

/** Effective end, resolving `ongoing` to today at read time (§7.4). */
export function effectiveEnd(e: TimelineEvent, today = todayDay()): number {
  return e.ongoing ? Math.max(e.start, today) : e.end
}

export function effectiveSpan(e: TimelineEvent, today = todayDay()): { start: number; end: number } {
  return { start: e.start, end: effectiveEnd(e, today) }
}

/** Inclusive-day duration; instantaneous events are 1 day long. */
export function durationDays(e: TimelineEvent, today = todayDay()): number {
  return effectiveEnd(e, today) - e.start + 1
}

/** Overlap test used everywhere — overlap, never "starts within" (§9.2). */
export function overlapsRange(
  e: TimelineEvent,
  viewStart: number,
  viewEnd: number,
  today = todayDay(),
): boolean {
  return e.start <= viewEnd && effectiveEnd(e, today) >= viewStart
}

type Migration = (doc: TimelineDoc) => TimelineDoc

/** Keyed by the schema version each function upgrades *from*. */
const MIGRATIONS: Record<number, Migration> = {
  // 0: (doc) => ({ ...doc, schema: 1, /* … */ }),
}

export class SchemaTooNewError extends Error {
  constructor(found: number) {
    super(
      `This file uses schema ${found}, but this version of Timeline only understands up to ` +
        `${SCHEMA_VERSION}. Update the app before opening it — loading it here would lose data.`,
    )
    this.name = 'SchemaTooNewError'
  }
}

/** Run the migration chain. Refuses unknown higher versions rather than guessing (§8.4). */
export function migrate(doc: TimelineDoc): TimelineDoc {
  if (typeof doc?.schema !== 'number') throw new Error('Not a Timeline document: no schema field.')
  if (doc.schema > SCHEMA_VERSION) throw new SchemaTooNewError(doc.schema)
  let out = doc
  while (out.schema < SCHEMA_VERSION) {
    const step = MIGRATIONS[out.schema]
    if (!step) throw new Error(`No migration from schema ${out.schema}.`)
    out = step(out)
  }
  return out
}

/** Structural check + invariant repair on load. Returns the doc and any repairs made. */
export function loadDoc(raw: unknown): { doc: TimelineDoc; repairs: string[] } {
  const doc = migrate(raw as TimelineDoc)
  const repairs: string[] = []
  const tagIds = new Set((doc.tags ?? []).map((t) => t.id))

  const events = (doc.events ?? []).map((e) => {
    let out = normalizeEvent(e)
    if (out !== e) repairs.push(`"${e.label}": end was before start, swapped.`)
    const kept = out.tags.filter((t) => tagIds.has(t))
    if (kept.length !== out.tags.length) {
      repairs.push(`"${out.label}": dropped ${out.tags.length - kept.length} unknown tag(s).`)
      out = { ...out, tags: kept }
    }
    return out
  })

  return {
    doc: {
      ...doc,
      tags: doc.tags ?? [],
      rows: doc.rows ?? [],
      views: doc.views ?? [],
      events,
    },
    repairs,
  }
}

/** A small starter document so a first run isn't an empty void. */
export function starterDoc(): TimelineDoc {
  const doc = emptyDoc('My timeline')
  const home = makeTag('home', '#b87040')
  const work = makeTag('work', '#3d8c7a')
  const school = makeTag('school', '#8878a8')
  const era = makeTag('era', '#5a8460')
  doc.tags = [home, work, school, era]

  const d = (y: number, m = 1, day = 1) => daysFromCivil(y, m, day)
  doc.events = [
    makeEvent({ label: 'Belgium', start: d(1993, 1, 1), end: d(1997, 8, 20), tags: [home.id] }),
    makeEvent({ label: 'Portland', start: d(1997, 8, 21), end: d(2011, 6, 1), tags: [home.id] }),
    makeEvent({ label: 'Seattle', start: d(2011, 6, 2), end: d(2020, 3, 1), tags: [home.id] }),
    makeEvent({ label: 'Portland again', start: d(2020, 3, 2), end: 0, ongoing: true, tags: [home.id] }),
    makeEvent({ label: 'University', start: d(2005, 9, 1), end: d(2009, 6, 15), tags: [school.id] }),
    makeEvent({ label: 'First job', start: d(2009, 7, 6), end: d(2014, 2, 28), tags: [work.id] }),
    makeEvent({ label: 'Second job', start: d(2014, 3, 3), end: d(2021, 11, 30), tags: [work.id] }),
    makeEvent({ label: 'Freelance', start: d(2021, 12, 1), end: 0, ongoing: true, tags: [work.id] }),
    makeEvent({ label: 'The PDX years', start: d(1997, 8, 21), end: d(2011, 6, 1), tags: [era.id] }),
  ]

  doc.rows = [
    makeRow('era', {
      source: { kind: 'tag', tagIds: [era.id] },
      layer: 'backdrop',
      pinned: true,
      height: 22,
      order: 0,
    }),
    makeRow('home', { source: { kind: 'tag', tagIds: [home.id] }, order: 1 }),
    makeRow('school', { source: { kind: 'tag', tagIds: [school.id] }, order: 2 }),
    makeRow('work', { source: { kind: 'tag', tagIds: [work.id] }, order: 3 }),
  ]
  return doc
}
