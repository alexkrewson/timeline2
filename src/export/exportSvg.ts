/**
 * Standalone SVG export (§14). Vector first: editable downstream, prints clean.
 *
 * It reuses the same layout/label functions as the live chart rather than
 * re-implementing them, so what you export is what you saw. Styling is inlined
 * because the file has to stand on its own.
 */

import { effectiveEnd } from '../model/doc'
import { segmentsToPolygon } from '../model/packing'
import type { CorpusEvent, RowConfig, TimelineDoc } from '../model/types'
import { LABEL_FONT_SIZE, LABEL_PAD, planLabels } from '../render/labels'
import { barExtent, layoutRow, LANE_GAP, MIN_BAR_PX, type RowLayout } from '../render/layout'
import { desaturate, styleFor, textOn } from '../render/style'
import { truncateToWidth } from '../render/text'
import { todayDay } from '../time/days'
import { formatTick } from '../time/format'
import { rungFor, ticksFor } from '../time/ladder'
import { dayToX, fitRange, pxPerDay, type Camera } from '../time/scale'

export type ExportTheme = 'dark' | 'light'

export type ExportSettings = {
  startDay: number
  endDay: number
  rowIds: string[]
  widthPx: number
  /** The print constraint — the only place a row budget still matters. */
  maxHeightPx: number
  labelDensity: 'all' | 'sparse'
  theme: ExportTheme
  gutterWidth: number
  title: string
}

const PALETTE = {
  dark: {
    bg: '#1e1508',
    surface: '#2b1f10',
    grid: '#4a3820',
    gridMajor: '#6b5230',
    text: '#f5ece0',
    textDim: '#b8a890',
    textFaint: '#8a7d68',
    accent: '#3d8c7a',
  },
  light: {
    bg: '#ffffff',
    surface: '#f8fafc',
    grid: '#e2e8f0',
    gridMajor: '#cbd5e1',
    text: '#0f172a',
    textDim: '#64748b',
    textFaint: '#94a3b8',
    accent: '#3d8c7a',
  },
} as const

const AXIS_H = 40

export type ExportResult = {
  svg: string
  width: number
  height: number
  omittedRows: number
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildExportSvg(
  doc: TimelineDoc,
  corpus: CorpusEvent[],
  settings: ExportSettings,
): ExportResult {
  const c = PALETTE[settings.theme]
  const today = todayDay()
  const plotW = settings.widthPx - settings.gutterWidth
  const cam: Camera = fitRange(settings.startDay, settings.endDay, plotW, 0)
  const toX = (d: number) => dayToX(d, cam) + settings.gutterWidth

  const chosen = settings.rowIds
    .map((id) => doc.rows.find((r) => r.id === id))
    .filter((r): r is RowConfig => Boolean(r))

  const ctx = {
    doc,
    corpus,
    viewStart: settings.startDay,
    viewEnd: settings.endDay,
    today,
    filter: (e: (typeof doc.events)[number]) =>
      e.start <= settings.endDay && effectiveEnd(e, today) >= settings.startDay,
  }

  const layouts = chosen.map((row) => layoutRow(row, ctx))
  const tagsById = new Map(doc.tags.map((t) => [t.id, t]))

  // Height budget: keep rows in order until the print constraint is reached.
  const kept: RowLayout[] = []
  let y = AXIS_H + 10
  let omittedRows = 0
  for (const layout of layouts) {
    const h = layout.height + LABEL_PAD * 2
    if (kept.length > 0 && y + h > settings.maxHeightPx - 24) {
      omittedRows++
      continue
    }
    kept.push(layout)
    y += h + LANE_GAP * 2
  }
  const totalH = Math.max(AXIS_H + 40, y + 12)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.widthPx}" height="${totalH}" ` +
      `viewBox="0 0 ${settings.widthPx} ${totalH}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">`,
  )
  parts.push(`<title>${esc(settings.title)}</title>`)
  parts.push(`<rect width="${settings.widthPx}" height="${totalH}" fill="${c.bg}"/>`)

  // --- axis ---
  const rung = rungFor(pxPerDay(cam))
  const ticks = ticksFor(rung, settings.startDay, settings.endDay)
  parts.push(`<g>`)
  for (const t of ticks) {
    const x = round(toX(t.day))
    if (x < settings.gutterWidth - 1) continue
    parts.push(
      `<line x1="${x}" y1="${AXIS_H}" x2="${x}" y2="${totalH}" stroke="${
        t.major ? c.gridMajor : c.grid
      }" stroke-width="1"/>`,
      `<text x="${x + 4}" y="${AXIS_H - 12}" font-size="11" fill="${c.textDim}">${esc(
        formatTick(t.day, rung),
      )}</text>`,
    )
  }
  parts.push(
    `<text x="10" y="${AXIS_H - 12}" font-size="12" font-weight="700" fill="${c.text}">${esc(
      settings.title,
    )}</text>`,
  )
  parts.push(
    `<line x1="0" y1="${AXIS_H}" x2="${settings.widthPx}" y2="${AXIS_H}" stroke="${c.gridMajor}"/>`,
  )
  parts.push(`</g>`)

  // --- rows ---
  let rowY = AXIS_H + 10
  for (const layout of kept) {
    const top = rowY + LABEL_PAD
    parts.push(`<g transform="translate(0, ${round(top)})">`)

    // gutter identity, absorbing an unambiguous single event label (§6.3)
    const plan = planLabels(layout, {
      toX: (d) => dayToX(d, cam),
      width: plotW,
      density: settings.labelDensity,
    })
    const gutterText = plan.gutterAbsorbed
      ? `${layout.row.label} — ${plan.gutterAbsorbed}`
      : layout.row.label
    parts.push(
      `<text x="10" y="${round(Math.min(layout.height / 2 + 4, 16))}" font-size="11" ` +
        `font-weight="700" fill="${c.textDim}">${esc(
          truncateToWidth(gutterText, settings.gutterWidth - 18, 11),
        )}</text>`,
    )

    for (const p of layout.packed.placed) {
      const style = styleFor(p.event, tagsById, layout.colorVariant(p.event.id))
      const fill = style.desaturated ? desaturate(style.fill) : style.fill
      const points = segmentsToPolygon(p.segments, layout.laneTop(p.lane), toX, MIN_BAR_PX)
      if (!points) continue
      parts.push(
        `<polygon points="${points}" fill="${fill}"${
          style.outline ? ` stroke="${c.text}" stroke-dasharray="3 2" stroke-width="1"` : ''
        }/>`,
      )
      if (style.stripe) {
        for (const seg of p.segments) {
          const ext = barExtent(seg.start, seg.endEx, toX)
          parts.push(
            `<rect x="${round(ext.x0)}" y="${round(
              layout.laneTop(p.lane) + seg.top + seg.height - 3,
            )}" width="${round(Math.max(MIN_BAR_PX, ext.x1 - ext.x0))}" height="3" fill="${textOn(
              fill,
            )}"/>`,
          )
        }
      }
    }

    for (const l of plan.labels) {
      const placed = layout.packed.placed.find((p) => p.event.id === l.eventId)
      const barFill = placed
        ? styleFor(placed.event, tagsById, layout.colorVariant(placed.event.id)).fill
        : c.surface
      const x = round(l.x + settings.gutterWidth)
      if (l.leader) {
        parts.push(
          `<line x1="${round(l.leader.x1 + settings.gutterWidth)}" y1="${round(l.leader.y1)}" ` +
            `x2="${round(l.leader.x2 + settings.gutterWidth)}" y2="${round(l.leader.y2)}" ` +
            `stroke="${c.textFaint}" stroke-width="1"/>`,
        )
      }
      const turned =
        l.kind === 'rotated'
          ? ` transform="rotate(-90, ${x}, ${round(l.y)})" text-anchor="middle"` +
            ' dominant-baseline="central"'
          : ''
      parts.push(
        `<text x="${x}" y="${round(l.y)}" font-size="${LABEL_FONT_SIZE}" font-weight="500"${turned} ` +
          `fill="${l.kind === 'overflow' ? c.textDim : textOn(barFill)}">${esc(l.text)}</text>`,
      )
    }

    parts.push(`</g>`)
    rowY += layout.height + LABEL_PAD * 2 + LANE_GAP * 2
  }

  if (omittedRows > 0) {
    parts.push(
      `<text x="10" y="${totalH - 6}" font-size="10" fill="${c.textFaint}">` +
        `${omittedRows} row${omittedRows === 1 ? '' : 's'} omitted to fit the maximum height</text>`,
    )
  }

  parts.push('</svg>')
  return { svg: parts.join('\n'), width: settings.widthPx, height: totalH, omittedRows }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** Rasterise an SVG string at a chosen DPI. */
export function svgToPng(svg: string, width: number, height: number, dpi: number): Promise<Blob> {
  const scale = dpi / 96
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas produced no image'))), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not rasterise the SVG'))
    }
    img.src = url
  })
}

/** PDF, generated from the SVG so it stays vector. */
export async function svgToPdf(svg: string, width: number, height: number): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [width, height],
  })
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    await svg2pdf(host.firstElementChild as SVGElement, pdf, { width, height })
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}
