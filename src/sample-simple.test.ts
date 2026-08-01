/**
 * The simple sample's job is to be readable. The dense fixture proves crowding
 * is handled; this one proves the uncrowded case comes out clean — every label
 * placed, nothing hidden, no spill.
 */

import { describe, expect, it } from 'vitest'
import sample from '../samples/sample-simple.timeline.json'
import { durationDays, effectiveEnd, loadDoc } from './model/doc'
import type { CorpusEvent, TimelineDoc } from './model/types'
import { planLabels } from './render/labels'
import { layoutRow } from './render/layout'
import { styleFor } from './render/style'
import { daysFromCivil, todayDay } from './time/days'
import { dayToX, fitRange } from './time/scale'

const { doc, repairs } = loadDoc(sample as unknown as TimelineDoc)
const today = todayDay()
const WIDTH = 1200

const born = daysFromCivil(1986, 5, 14)
const end = Math.max(...doc.events.map((e) => effectiveEnd(e, today)))
const cam = fitRange(born, end, WIDTH)
const toX = (d: number) => dayToX(d, cam)
const ctx = {
  doc,
  corpus: [] as CorpusEvent[],
  viewStart: born,
  viewEnd: end,
  today,
  filter: null,
}
const layoutFor = (label: string) => layoutRow(doc.rows.find((r) => r.label === label)!, ctx)
const labelsIn = (label: string) =>
  doc.events.filter((e) => e.tags.includes(doc.tags.find((t) => t.label === label)!.id))

describe('simple sample', () => {
  it('loads cleanly', () => {
    expect(repairs).toEqual([])
    expect(doc.events).toHaveLength(9)
    expect(doc.rows.map((r) => r.label)).toEqual(['life', 'school', 'work', 'friends'])
  })

  it('has exactly three schools, three jobs and two friends', () => {
    expect(labelsIn('school')).toHaveLength(3)
    expect(labelsIn('work')).toHaveLength(3)
    expect(labelsIn('friends')).toHaveLength(2)
  })

  it('is born on 14 May 1986, as an instantaneous event', () => {
    const birth = doc.events.find((e) => e.label === 'Born')!
    expect(birth.start).toBe(born)
    expect(birth.end).toBe(birth.start)
    expect(durationDays(birth, today)).toBe(1)
  })

  it('meets one friend at 10 and the other at 20', () => {
    const friends = labelsIn('friends').sort((a, b) => a.start - b.start)
    const ageAt = (day: number) => Math.floor((day - born) / 365.2425)
    expect(ageAt(friends[0].start)).toBe(10)
    expect(ageAt(friends[1].start)).toBe(20)
    for (const f of friends) expect(f.ongoing).toBe(true)
  })

  it('runs the schools and jobs in order without overlapping', () => {
    for (const row of ['school', 'work']) {
      const layout = layoutFor(row)
      expect(layout.packed.laneCount).toBe(1)
      expect(layout.packed.spilled).toBe(false)
      // One lane, no overlap — so every bar keeps the full lane height.
      for (const p of layout.packed.placed) {
        expect(p.segments).toHaveLength(1)
        expect(p.segments[0].height).toBe(layout.laneHeight)
      }
    }
  })

  it('gives each friend their own line', () => {
    const layout = layoutFor('friends')
    expect(layout.row.packing).toBe('per-event')
    expect(layout.packed.laneCount).toBe(2)
    // One friend, one lane, full height — no sub-banding where they overlap.
    for (const p of layout.packed.placed) {
      expect(p.segments).toHaveLength(1)
      expect(p.segments[0].height).toBe(layout.laneHeight)
    }
    const sam = layout.packed.placed.find((p) => p.event.label.startsWith('Sam'))!
    const rosa = layout.packed.placed.find((p) => p.event.label.startsWith('Rosa'))!
    expect(sam.lane).toBe(0)
    expect(rosa.lane).toBe(1)
  })

  it('gives each friend their own colour', () => {
    const layout = layoutFor('friends')
    const fills = layout.packed.placed.map(
      (p) => styleFor(p.event, new Map(doc.tags.map((t) => [t.id, t])), layout.colorVariant(p.event.id)).fill,
    )
    expect(new Set(fills).size).toBe(2)
  })

  it('carries an age scale, born 14 May 1986', () => {
    expect(doc.meta.birthDay).toBe(born)
    // University starts at 18 and the last job at 33.
    const ageAt = (d: number) => Math.floor((d - born) / 365.2425)
    expect(ageAt(doc.events.find((e) => e.label === 'University')!.start)).toBe(18)
    expect(ageAt(doc.events.find((e) => e.label.startsWith('Third job'))!.start)).toBe(33)
  })

  it('carries the ongoing jobs and friendships to today', () => {
    for (const e of doc.events.filter((x) => x.ongoing)) {
      expect(effectiveEnd(e, today)).toBe(today)
    }
  })

  it('places every label, hiding none', () => {
    for (const row of doc.rows) {
      const plan = planLabels(layoutRow(row, ctx), { toX, width: WIDTH })
      expect(plan.dropped).toBe(0)
      expect(plan.labels.length).toBeGreaterThan(0)
    }
  })

  it('has no overlapping labels anywhere', () => {
    for (const row of doc.rows) {
      const plan = planLabels(layoutRow(row, ctx), { toX, width: WIDTH })
      const boxes = plan.labels.map((l) => ({
        x0: l.x, x1: l.x + l.width, y0: l.y - 11, y1: l.y + 3, text: l.text,
      }))
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]]
          expect(
            a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1,
            `"${a.text}" overlaps "${b.text}" in row "${row.label}"`,
          ).toBe(false)
        }
      }
    }
  })
})
