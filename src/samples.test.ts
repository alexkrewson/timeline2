/**
 * Asserts the sample document actually exercises the hard paths. A fixture
 * that quietly stopped triggering spill or overflow labels would still load
 * fine and would silently stop being a test — so the stress properties are
 * themselves assertions.
 */

import { describe, expect, it } from 'vitest'
import sample from '../samples/sample-dense.timeline.json'
import { effectiveEnd, loadDoc } from './model/doc'
import { eventsForRow } from './model/rows'
import type { CorpusEvent, TimelineDoc } from './model/types'
import { LABEL_FONT_SIZE, LABEL_PAD, planLabels } from './render/labels'
import { barExtent, layoutRow, MIN_BAR_PX } from './render/layout'
import { daysFromCivil, todayDay } from './time/days'
import { dayToX, fitRange } from './time/scale'

const D = (y: number, m = 1, d = 1) => daysFromCivil(y, m, d)

const { doc, repairs } = loadDoc(sample as unknown as TimelineDoc)
const today = todayDay()
const WIDTH = 1200

const span = {
  start: Math.min(...doc.events.map((e) => e.start)),
  end: Math.max(...doc.events.map((e) => effectiveEnd(e, today))),
}
const cam = fitRange(span.start, span.end, WIDTH)
const toX = (d: number) => dayToX(d, cam)
const ctx = {
  doc,
  corpus: [] as CorpusEvent[],
  viewStart: span.start,
  viewEnd: span.end,
  today,
  filter: null,
}

const layoutFor = (label: string) => layoutRow(doc.rows.find((r) => r.label === label)!, ctx)

describe('sample document', () => {
  it('loads cleanly, with no invariant repairs needed', () => {
    expect(repairs).toEqual([])
    expect(doc.schema).toBe(1)
    expect(doc.events.length).toBeGreaterThan(100)
    for (const e of doc.events) expect(e.end).toBeGreaterThanOrEqual(e.start)
  })

  it('spans a whole life, roughly 1988 to now', () => {
    expect(span.end).toBeGreaterThanOrEqual(today - 1)
    expect(span.end - span.start).toBeGreaterThan(365 * 35)
  })

  it('triggers the spill rule in the friends row', () => {
    const friends = layoutFor('friends')
    expect(friends.packed.spillCount).toBeGreaterThan(0)
    expect(friends.packed.laneCount).toBeGreaterThan(1)
    // Spilling is flagged, never an error — every event still gets placed.
    expect(friends.packed.placed).toHaveLength(friends.events.length)
  })

  it('never draws a sub-band under the row minimum, in any row', () => {
    for (const row of doc.rows) {
      const layout = layoutRow(row, ctx)
      for (const p of layout.packed.placed) {
        for (const seg of p.segments) {
          expect(seg.height).toBeGreaterThanOrEqual(row.minSubBandPx)
        }
      }
    }
  })

  it('produces stepped polygons — bars that narrow mid-span', () => {
    const stepped = layoutFor('home').packed.placed.filter((p) => p.segments.length > 1)
    expect(stepped.length).toBeGreaterThan(0)
    const seg = stepped[0].segments
    expect(new Set(seg.map((s) => s.height)).size).toBeGreaterThan(1)
  })

  it('keeps instantaneous events visible at full-life zoom', () => {
    const family = layoutFor('family')
    const instants = family.packed.placed.filter((p) => p.start === p.end)
    expect(instants.length).toBeGreaterThan(0)
    for (const p of instants) {
      const { x0, x1 } = barExtent(p.segments[0].start, p.segments[0].endEx, toX)
      // A single day at 38-year zoom is a fraction of a pixel without the floor.
      expect(x1 - x0).toBeGreaterThanOrEqual(MIN_BAR_PX)
      expect((p.end - p.start + 1) * Math.exp(cam.logScale)).toBeLessThan(MIN_BAR_PX)
    }
  })

  it('resolves ongoing events to today rather than their stored end', () => {
    const ongoing = doc.events.filter((e) => e.ongoing)
    expect(ongoing.length).toBeGreaterThan(5)
    for (const e of ongoing) expect(effectiveEnd(e, today)).toBe(Math.max(e.start, today))
  })

  it('puts the six-tag event in six rows and the untagged event in none', () => {
    const six = doc.events.find((e) => e.tags.length === 6)!
    const none = doc.events.find((e) => e.tags.length === 0)!
    const rowsWith = (id: string) =>
      doc.rows.filter((r) => eventsForRow(r, ctx).some((e) => e.id === id)).length
    expect(rowsWith(six.id)).toBe(6)
    expect(rowsWith(none.id)).toBe(0)
  })

  it('drives every modifier channel', () => {
    const channels = new Set(
      doc.events
        .flatMap((e) => e.tags)
        .map((id) => doc.tags.find((t) => t.id === id)?.styleChannel)
        .filter(Boolean),
    )
    expect(channels).toEqual(new Set(['fill', 'saturation', 'stripe', 'outline']))
  })

  it('never places two labels on top of each other, in any row at any zoom', () => {
    // The dense rows at several zooms — this is the property that was broken:
    // inline labels were placed without any collision check at all.
    const zooms = [
      fitRange(span.start, span.end, WIDTH),
      fitRange(D(2005), D(2015), WIDTH),
      fitRange(D(2016), D(2018), WIDTH),
      fitRange(D(2022, 6), D(2022, 8), WIDTH),
    ]
    let checked = 0
    for (const row of doc.rows) {
      const layout = layoutRow(row, ctx)
      for (const zoom of zooms) {
        const plan = planLabels(layout, { toX: (d) => dayToX(d, zoom), width: WIDTH })
        const boxes = plan.labels.map((l) => ({
          x0: l.x,
          x1: l.x + l.width,
          y0: l.y - LABEL_FONT_SIZE,
          y1: l.y + 3,
          text: l.text,
        }))
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]
            const b = boxes[j]
            const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
            if (overlap) {
              throw new Error(
                `"${a.text}" and "${b.text}" overlap in row "${row.label}" ` +
                  `(${a.x0.toFixed(0)}..${a.x1.toFixed(0)} vs ${b.x0.toFixed(0)}..${b.x1.toFixed(0)})`,
              )
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('keeps every label inside the space the row reserves for it', () => {
    const layout = layoutFor('friends')
    const plan = planLabels(layout, { toX, width: WIDTH })
    for (const l of plan.labels) {
      expect(l.y - LABEL_FONT_SIZE).toBeGreaterThanOrEqual(-LABEL_PAD)
      expect(l.y + 3).toBeLessThanOrEqual(layout.height + LABEL_PAD)
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x + l.width).toBeLessThanOrEqual(WIDTH + 1)
    }
  })

  it('reports labels it had to hide rather than dropping them silently', () => {
    // 36 friendships in a 26px row at 38-year zoom genuinely cannot all be
    // labelled; the row says so instead of looking empty.
    const plan = planLabels(layoutFor('friends'), { toX, width: WIDTH })
    expect(plan.dropped).toBeGreaterThan(0)
    expect(plan.labels.length + plan.dropped).toBe(
      layoutFor('friends').packed.placed.filter((p) => {
        const e = barExtent(p.segments[0].start, p.segments.at(-1)!.endEx, toX)
        return e.x1 >= 0 && e.x0 <= WIDTH
      }).length,
    )
  })

  it('forces labels into overflow lanes with leader lines', () => {
    const plan = planLabels(layoutFor('travel'), { toX, width: WIDTH })
    const overflow = plan.labels.filter((l) => l.kind === 'overflow')
    expect(overflow.length).toBeGreaterThan(0)
    for (const l of overflow) expect(l.leader).toBeTruthy()
  })

  it('clamps a label to the viewport edge when its bar starts off-screen', () => {
    // Zoom into 2021 — several long-running bars start well to the left.
    const zoomed = fitRange(
      Date.parse('2021-01-01') / 86400000,
      Date.parse('2021-12-31') / 86400000,
      WIDTH,
    )
    const plan = planLabels(layoutFor('friends'), {
      toX: (d) => dayToX(d, zoomed),
      width: WIDTH,
    })
    const sticky = plan.labels.filter((l) => l.kind === 'sticky')
    expect(sticky.length).toBeGreaterThan(0)
    for (const l of sticky) expect(l.x).toBeGreaterThanOrEqual(0)
  })

  it('absorbs a row label into the gutter only when unambiguous', () => {
    // The era row is one lane; zoomed into 2018 a single era covers the view.
    const eraRow = doc.rows.find((r) => r.label === 'era')!
    const inside = fitRange(
      Date.parse('2018-03-01') / 86400000,
      Date.parse('2018-09-01') / 86400000,
      WIDTH,
    )
    const plan = planLabels(layoutRow(eraRow, ctx), {
      toX: (d) => dayToX(d, inside),
      width: WIDTH,
    })
    expect(plan.gutterAbsorbed).toBe('The Portland years')

    // Across the whole life, many eras are in view — it must fall back.
    const wide = planLabels(layoutRow(eraRow, ctx), { toX, width: WIDTH })
    expect(wide.gutterAbsorbed).toBeNull()
  })
})
