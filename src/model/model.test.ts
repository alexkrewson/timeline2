import { describe, expect, it } from 'vitest'
import { daysFromCivil, todayDay } from '../time/days'
import {
  durationDays,
  effectiveEnd,
  emptyDoc,
  loadDoc,
  makeEvent,
  makeRow,
  makeTag,
  migrate,
  normalizeEvent,
  overlapsRange,
  SchemaTooNewError,
} from './doc'
import { parseFlexibleDate } from './parseDate'
import { durationFactor, recommend } from './recommend'
import { eventsForRow, sortRows } from './rows'
import type { CorpusEvent, TimelineDoc } from './types'

describe('event invariants', () => {
  it('swaps a reversed range rather than rejecting it', () => {
    const e = makeEvent({ start: 100, end: 10 })
    expect(normalizeEvent(e)).toMatchObject({ start: 10, end: 100 })
  })

  it('renders an ongoing event to today, not to its stored end', () => {
    const e = makeEvent({ label: 'freelance', start: 0, end: 5, ongoing: true })
    const today = todayDay()
    expect(effectiveEnd(e)).toBe(today)
    expect(effectiveEnd(e)).not.toBe(5)
    expect(durationDays(e)).toBe(today + 1)
    // …and a stale document still reads correctly years later
    expect(effectiveEnd(e, 999_999)).toBe(999_999)
  })

  it('treats end === start as instantaneous, one day long', () => {
    expect(durationDays(makeEvent({ start: 7, end: 7 }))).toBe(1)
  })

  it('selects by overlap, not by start-within', () => {
    const coldWar = makeEvent({ start: daysFromCivil(1947, 3, 12), end: daysFromCivil(1991, 12, 26) })
    const viewStart = daysFromCivil(1960, 1, 1)
    const viewEnd = daysFromCivil(1970, 1, 1)
    expect(overlapsRange(coldWar, viewStart, viewEnd)).toBe(true)
    expect(coldWar.start >= viewStart).toBe(false) // a start-based rule would miss it
  })
})

describe('tags and row membership', () => {
  const doc = emptyDoc()
  const tags = ['home', 'work', 'friends', 'travel', 'health', 'music'].map((l) =>
    makeTag(l, '#b87040'),
  )
  doc.tags = tags
  const untagged = makeEvent({ label: 'untagged', start: 0, end: 10 })
  const sixTags = makeEvent({ label: 'six tags', start: 0, end: 10, tags: tags.map((t) => t.id) })
  const shared = makeEvent({ label: 'shared', start: 0, end: 10, tags: [tags[0].id, tags[1].id, tags[2].id] })
  doc.events = [untagged, sixTags, shared]

  const ctx = { doc, corpus: [] as CorpusEvent[], viewStart: -100, viewEnd: 100, today: 0 }

  it('places an untagged event in no row', () => {
    for (const tag of tags) {
      const row = makeRow(tag.label, { source: { kind: 'tag', tagIds: [tag.id] } })
      expect(eventsForRow(row, ctx).map((e) => e.label)).not.toContain('untagged')
    }
  })

  it('places a six-tag event in all six rows', () => {
    for (const tag of tags) {
      const row = makeRow(tag.label, { source: { kind: 'tag', tagIds: [tag.id] } })
      expect(eventsForRow(row, ctx).map((e) => e.label)).toContain('six tags')
    }
  })

  it('shows the same event in three visible rows at once', () => {
    const rows = [tags[0], tags[1], tags[2]].map((t) =>
      makeRow(t.label, { source: { kind: 'tag', tagIds: [t.id] } }),
    )
    const hits = rows.filter((r) => eventsForRow(r, ctx).some((e) => e.id === shared.id))
    expect(hits).toHaveLength(3)
  })

  it('sorts rows by order then first start — a key both FLIP states agree on', () => {
    const a = makeRow('a', { order: 1 })
    const b = makeRow('b', { order: 0 })
    const c = makeRow('c', { order: 1 })
    const starts: Record<string, number> = { [a.id]: 50, [b.id]: 0, [c.id]: 10 }
    expect(sortRows([a, b, c], (r) => starts[r.id]).map((r) => r.label)).toEqual(['b', 'c', 'a'])
  })
})

describe('flexible date parsing', () => {
  const p = (s: string, role: 'start' | 'end' = 'start') => parseFlexibleDate(s, role)

  it('resolves a bare year to Jan 1 in start and Dec 31 in end', () => {
    expect(p('2005')!.day).toBe(daysFromCivil(2005, 1, 1))
    expect(p('2005', 'end')!.day).toBe(daysFromCivil(2005, 12, 31))
  })

  it('resolves a month to its first and last day', () => {
    expect(p('mar 2012')!.day).toBe(daysFromCivil(2012, 3, 1))
    expect(p('mar 2012', 'end')!.day).toBe(daysFromCivil(2012, 3, 31))
    expect(p('feb 2024', 'end')!.day).toBe(daysFromCivil(2024, 2, 29)) // leap year
    expect(p('february 2023', 'end')!.day).toBe(daysFromCivil(2023, 2, 28))
  })

  it('resolves explicit days identically in both fields', () => {
    for (const s of ['2012-03-03', '3/3/2012', '3 mar 2012', 'mar 3 2012', 'March 3, 2012']) {
      expect(p(s)!.day).toBe(daysFromCivil(2012, 3, 3))
      expect(p(s, 'end')!.day).toBe(daysFromCivil(2012, 3, 3))
    }
  })

  it('reads a bare negative year the way a person means it', () => {
    expect(p('-3000')!.echo).toBe('1 January 3000 BCE')
    expect(p('-3000', 'end')!.echo).toBe('31 December 3000 BCE')
    expect(p('3000 BCE')!.day).toBe(p('-3000')!.day)
  })

  it('reads day-first when the first field cannot be a month', () => {
    expect(p('25/12/2012')!.day).toBe(daysFromCivil(2012, 12, 25))
  })

  it('clamps an impossible day to the end of its month', () => {
    expect(p('feb 31 2023')!.day).toBe(daysFromCivil(2023, 2, 28))
  })

  it('accepts deep time', () => {
    expect(p('13.8 gya')!.granularity).toBe('deep')
    expect(p('540 mya')!.echo).toContain('Mya')
    expect(p('12 kya')!.day).toBeLessThan(0)
  })

  it('returns null for gibberish rather than guessing', () => {
    expect(p('')).toBeNull()
    expect(p('sometime later')).toBeNull()
  })

  it('echoes in plain language', () => {
    expect(p('2012-03-01')!.echo).toBe('1 March 2012')
  })
})

describe('duration-aware recommendation', () => {
  const corpus: CorpusEvent[] = [
    corpusEvent('20th century', 1901, 2000, 0.9),
    corpusEvent('Cold War', 1947, 1991, 0.95),
    corpusEvent('Apollo 11', 1969, 1969, 0.85),
    corpusEvent('Woodstock', 1969, 1969, 0.6),
  ]

  function corpusEvent(label: string, y0: number, y1: number, significance: number): CorpusEvent {
    return {
      ...makeEvent({
        label,
        start: daysFromCivil(y0, 1, 1),
        end: daysFromCivil(y1, 12, 31),
        source: 'corpus',
      }),
      significance,
      topics: ['history'],
      entityId: null,
      url: '',
    }
  }

  const view = { viewStart: daysFromCivil(1969, 1, 1), viewEnd: daysFromCivil(1970, 1, 1), today: 0 }

  it('off mode is raw popularity — scale-blind by construction', () => {
    const top = recommend(corpus, { ...view, mode: 'off', maxRows: 2 })
    expect(top.map((s) => s.event.label)).toEqual(['Cold War', '20th century'])
  })

  it('prefer-matching surfaces events shaped like the viewport', () => {
    const top = recommend(corpus, { ...view, mode: 'prefer-matching', maxRows: 2 })
    expect(top.map((s) => s.event.label)).toEqual(['Apollo 11', 'Woodstock'])
  })

  it('prefer-enclosing is the inverse, not the absence, of the discount', () => {
    const top = recommend(corpus, { ...view, mode: 'prefer-enclosing', maxRows: 2 })
    expect(top.map((s) => s.event.label)).toEqual(['20th century', 'Cold War'])
  })

  it('includes long events that started before the view', () => {
    const all = recommend(corpus, { ...view, mode: 'off', maxRows: 10 })
    expect(all.map((s) => s.event.label)).toContain('Cold War')
  })

  it('duration factors behave at the extremes', () => {
    expect(durationFactor(0, 'off')).toBe(1)
    expect(durationFactor(0, 'prefer-matching')).toBeCloseTo(1, 10)
    expect(durationFactor(3, 'prefer-matching')).toBeLessThan(0.001)
    expect(durationFactor(-3, 'prefer-matching')).toBeLessThan(0.001)
    expect(durationFactor(5, 'prefer-enclosing')).toBeGreaterThan(
      durationFactor(0, 'prefer-enclosing'),
    )
  })
})

describe('schema and migration', () => {
  it('refuses a document from a newer schema rather than guessing', () => {
    const future = { ...emptyDoc(), schema: 99 } as TimelineDoc
    expect(() => migrate(future)).toThrow(SchemaTooNewError)
    expect(() => migrate(future)).toThrow(/only understands up to 1/)
  })

  it('rejects a file that is not a Timeline document', () => {
    expect(() => migrate({} as TimelineDoc)).toThrow(/no schema field/)
  })

  it('repairs invariants on load and reports what it changed', () => {
    const doc = emptyDoc()
    const tag = makeTag('home', '#b87040')
    doc.tags = [tag]
    doc.events = [
      makeEvent({ label: 'backwards', start: 50, end: 10 }),
      makeEvent({ label: 'ghost tag', start: 0, end: 1, tags: [tag.id, 't_missing'] }),
    ]
    const { doc: loaded, repairs } = loadDoc(doc)
    expect(loaded.events[0]).toMatchObject({ start: 10, end: 50 })
    expect(loaded.events[1].tags).toEqual([tag.id])
    expect(repairs).toHaveLength(2)
  })
})
