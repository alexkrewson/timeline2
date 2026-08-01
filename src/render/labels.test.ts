/**
 * Label placement, on purpose-built geometry.
 *
 * The sample fixtures prove the engine survives real crowding; these build the
 * exact bar width and row height each branch needs, so a test can't silently
 * stop exercising its branch because a fixture's zoom arithmetic shifted.
 */

import { describe, expect, it } from 'vitest'
import { emptyDoc, makeEvent, makeRow, makeTag } from '../model/doc'
import type { CorpusEvent, RowConfig } from '../model/types'
import { planLabels, type LabelKind } from './labels'
import { layoutRow } from './layout'

const WIDTH = 600

/**
 * One bar of exactly `barPx` pixels in a row of exactly `height`, with the
 * scale chosen so the bar lands at x = 100.
 */
function scene(label: string, barPx: number, height: number, extra: Partial<RowConfig> = {}) {
  const tag = makeTag('t', '#b87040')
  const doc = emptyDoc()
  doc.tags = [tag]
  const days = 100
  doc.events = [makeEvent({ label, start: 0, end: days - 1, tags: [tag.id] })]

  const row = makeRow('row', {
    source: { kind: 'tag', tagIds: [tag.id] },
    height,
    ...extra,
  })
  const layout = layoutRow(row, {
    doc,
    corpus: [] as CorpusEvent[],
    viewStart: -1000,
    viewEnd: 1000,
    today: 0,
    filter: null,
  })
  const pxPerDay = barPx / days
  return planLabels(layout, { toX: (d) => 100 + d * pxPerDay, width: WIDTH })
}

const kindOf = (plan: ReturnType<typeof scene>): LabelKind | 'none' =>
  plan.labels[0]?.kind ?? 'none'

describe('label placement branches', () => {
  it('goes inline when the bar is wide and tall enough', () => {
    expect(kindOf(scene('Belgium', 200, 30))).toBe('inline')
  })

  it('turns sideways when the bar is narrow but the row is tall', () => {
    const plan = scene('Pizza Hut', 20, 60)
    expect(kindOf(plan)).toBe('rotated')
    // Centred on the bar, not anchored at its left edge.
    expect(plan.labels[0].x).toBeCloseTo(110, 0)
    expect(plan.labels[0].y).toBeCloseTo(30, 0)
  })

  it('prefers inline over rotated when both would fit', () => {
    expect(kindOf(scene('Pizza Hut', 200, 60))).toBe('inline')
  })

  it('floats when the bar is too narrow to turn text in', () => {
    // 10px is under the glyph height — turning it would still not be readable.
    expect(kindOf(scene('Pizza Hut', 10, 60))).toBe('overflow')
  })

  it('floats when the row is too short to turn text in', () => {
    expect(kindOf(scene('Pizza Hut', 20, 20))).toBe('overflow')
  })

  it('truncates a turned label to the height available', () => {
    const short = scene('An extremely long label that cannot possibly fit', 20, 40)
    const tall = scene('An extremely long label that cannot possibly fit', 20, 120)
    expect(kindOf(short)).toBe('rotated')
    expect(kindOf(tall)).toBe('rotated')
    expect(short.labels[0].text.length).toBeLessThan(tall.labels[0].text.length)
    expect(short.labels[0].text.endsWith('…')).toBe(true)
  })

  it('never turns a label wider than its bar is tall', () => {
    for (const height of [40, 60, 100, 160]) {
      const plan = scene('Something reasonably long here', 20, height)
      for (const l of plan.labels.filter((x) => x.kind === 'rotated')) {
        expect(l.width).toBeLessThanOrEqual(height - 8 + 1)
      }
    }
  })

  it('reports a label it cannot place anywhere', () => {
    // 'sparse' skips the floating lanes, so a too-narrow bar has nowhere left.
    const tag = makeTag('t', '#b87040')
    const doc = emptyDoc()
    doc.tags = [tag]
    doc.events = [makeEvent({ label: 'Hidden', start: 0, end: 0, tags: [tag.id] })]
    const layout = layoutRow(
      makeRow('row', { source: { kind: 'tag', tagIds: [tag.id] }, height: 20 }),
      { doc, corpus: [], viewStart: -10, viewEnd: 10, today: 0, filter: null },
    )
    const plan = planLabels(layout, { toX: (d) => 100 + d, width: WIDTH, density: 'sparse' })
    expect(plan.labels).toHaveLength(0)
    expect(plan.dropped).toBe(1)
  })
})
