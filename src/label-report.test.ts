/**
 * Not an assertion suite — a readout. A collision test passes trivially if
 * placement simply drops everything, so this prints how many labels each row
 * actually keeps, and how.
 */

import { describe, it } from 'vitest'
import sample from '../samples/sample-dense.timeline.json'
import { loadDoc } from './model/doc'
import type { CorpusEvent, TimelineDoc } from './model/types'
import { planLabels } from './render/labels'
import { layoutRow } from './render/layout'
import { todayDay } from './time/days'
import { dayToX, fitRange } from './time/scale'

describe('label yield', () => {
  it('reports placement per row', () => {
    const { doc } = loadDoc(sample as unknown as TimelineDoc)
    const today = todayDay()
    const width = 1200
    const start = Math.min(...doc.events.map((e) => e.start))
    const end = Math.max(...doc.events.map((e) => e.end))
    const cam = fitRange(start, end, width)
    const ctx = {
      doc,
      corpus: [] as CorpusEvent[],
      viewStart: start,
      viewEnd: end,
      today,
      filter: null,
    }

    const rows: string[] = []
    for (const row of doc.rows) {
      const layout = layoutRow(row, ctx)
      const plan = planLabels(layout, { toX: (d) => dayToX(d, cam), width })
      const by = (k: string) => plan.labels.filter((l) => l.kind === k).length
      const total = plan.labels.length + plan.dropped
      rows.push(
        `${row.label.padEnd(8)} ${String(layout.packed.placed.length).padStart(3)} bars · ` +
          `${String(plan.labels.length).padStart(3)}/${String(total).padStart(3)} labelled ` +
          `(inline ${by('inline')}, sticky ${by('sticky')}, floating ${by('overflow')}, ` +
          `hidden ${plan.dropped}) · ${layout.packed.laneCount} lanes`,
      )
    }
    console.log(`\n${rows.join('\n')}\n`)
  })
})
