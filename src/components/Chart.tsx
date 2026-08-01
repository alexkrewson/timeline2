/** The chart surface: axis, rows, bars, labels, backdrop band. */

import { memo, useMemo } from 'react'
import type { PlacedEvent } from '../model/packing'
import { segmentsToPolygon } from '../model/packing'
import type { Tag, TimelineEvent } from '../model/types'
import { LABEL_FONT_SIZE, LABEL_PAD, type LabelPlan } from '../render/labels'
import { barExtent, isVisible, MIN_BAR_PX, type RowLayout } from '../render/layout'
import { wasPanning } from '../render/panGuard'
import { desaturate, styleFor, textOn } from '../render/style'
import { truncateToWidth } from '../render/text'
import { formatDayShort, formatDuration, formatTick, tickContext } from '../time/format'
import { rungFor, ticksFor } from '../time/ladder'
import { dayToX, pxPerDay, viewRange, type Camera } from '../time/scale'

export type BarHandlers = {
  onSelect: (event: TimelineEvent) => void
  onOpen: (event: TimelineEvent) => void
  onContext: (event: TimelineEvent, x: number, y: number) => void
}

// ---------------------------------------------------------------- axis

export const Axis = memo(function Axis({
  cam,
  width,
  today,
}: {
  cam: Camera
  width: number
  today: number
}) {
  const scale = pxPerDay(cam)
  const rung = rungFor(scale)
  const { start, end } = viewRange(cam, width)
  const ticks = ticksFor(rung, start, end)
  const todayX = dayToX(today, cam)

  return (
    <svg className="axis__svg" width={width} height={46} role="presentation">
      <line className="axis__rule" x1={0} y1={45.5} x2={width} y2={45.5} />
      {ticks.map((t) => {
        const x = Math.round(dayToX(t.day, cam)) + 0.5
        const context = tickContext(t.day, rung)
        return (
          <g key={t.day} className={`axis__tick${t.major ? ' axis__tick--major' : ''}`}>
            <line x1={x} y1={32} x2={x} y2={46} />
            <text x={x + 4} y={16}>
              {formatTick(t.day, rung)}
            </text>
            {context && (
              <text className="axis__context" x={x + 4} y={29}>
                {context}
              </text>
            )}
          </g>
        )
      })}
      {todayX >= 0 && todayX <= width && (
        <line className="axis__today" x1={todayX} y1={0} x2={todayX} y2={46} />
      )}
    </svg>
  )
})

// ---------------------------------------------------------------- row

type RowProps = {
  layout: RowLayout
  plan: LabelPlan
  cam: Camera
  width: number
  tagsById: Map<string, Tag>
  selectedId: string | null
  matches: Set<string> | null
  today: number
  handlers: BarHandlers
}

export const ChartRow = memo(function ChartRow({
  layout,
  plan,
  cam,
  width,
  tagsById,
  selectedId,
  matches,
  today,
  handlers,
}: RowProps) {
  const toX = useMemo(() => (day: number) => dayToX(day, cam), [cam])
  const scale = pxPerDay(cam)
  const rung = rungFor(scale)
  const { start, end } = viewRange(cam, width)
  const ticks = useMemo(() => ticksFor(rung, start, end), [rung, start, end])
  const height = layout.height + LABEL_PAD * 2
  const todayX = dayToX(today, cam)

  return (
    <svg className="row__svg" width={width} height={height}>
      <g className="row__grid">
        {ticks.map((t) => {
          const x = Math.round(dayToX(t.day, cam)) + 0.5
          return (
            <line
              key={t.day}
              className={t.major ? 'row__gridline row__gridline--major' : 'row__gridline'}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
            />
          )
        })}
        {todayX >= 0 && todayX <= width && (
          <line className="row__today" x1={todayX} y1={0} x2={todayX} y2={height} />
        )}
      </g>

      <g transform={`translate(0, ${LABEL_PAD})`}>
        {layout.packed.placed.map((p) => (
          <Bar
            key={p.event.id}
            placed={p}
            layout={layout}
            toX={toX}
            width={width}
            tagsById={tagsById}
            selected={p.event.id === selectedId}
            dimmed={matches !== null && !matches.has(p.event.id)}
            today={today}
            handlers={handlers}
          />
        ))}

        {plan.labels.map((l) => {
          const placed = layout.packed.placed.find((p) => p.event.id === l.eventId)
          const fill = placed ? styleFor(placed.event, tagsById).fill : '#000'
          return (
            <g key={`${l.eventId}-${l.kind}`} className={`label label--${l.kind}`}>
              {l.leader && (
                <line
                  className="label__leader"
                  x1={l.leader.x1}
                  y1={l.leader.y1}
                  x2={l.leader.x2}
                  y2={l.leader.y2}
                />
              )}
              {l.kind === 'overflow' && (
                <rect
                  className="label__plate"
                  x={l.x - 3}
                  y={l.y - LABEL_FONT_SIZE + 1}
                  width={l.width + 6}
                  height={LABEL_FONT_SIZE + 4}
                  rx={3}
                />
              )}
              <text
                className="label__text"
                x={l.x}
                y={l.y}
                fill={l.kind === 'overflow' ? undefined : textOn(fill)}
                fontSize={LABEL_FONT_SIZE}
              >
                {l.text}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
})

function Bar({
  placed,
  layout,
  toX,
  width,
  tagsById,
  selected,
  dimmed,
  today,
  handlers,
}: {
  placed: PlacedEvent
  layout: RowLayout
  toX: (d: number) => number
  width: number
  tagsById: Map<string, Tag>
  selected: boolean
  dimmed: boolean
  today: number
  handlers: BarHandlers
}) {
  const first = placed.segments[0]
  const last = placed.segments.at(-1)!
  const { x0 } = barExtent(first.start, first.endEx, toX)
  const { x1 } = barExtent(last.start, last.endEx, toX)
  if (!isVisible(x0, x1, width)) return null

  const style = styleFor(placed.event, tagsById)
  const fill = style.desaturated ? desaturate(style.fill) : style.fill
  const laneTop = layout.laneTop(placed.lane)
  const points = segmentsToPolygon(placed.segments, laneTop, toX, MIN_BAR_PX)

  const classes = ['bar']
  if (selected) classes.push('bar--selected')
  if (dimmed) classes.push('bar--dimmed')
  if (style.outline) classes.push('bar--outline')
  if (placed.event.ongoing) classes.push('bar--ongoing')

  const tip =
    `${placed.event.label}\n${formatDayShort(placed.start)} – ` +
    `${placed.event.ongoing ? 'ongoing' : formatDayShort(placed.end)}` +
    ` (${formatDuration(placed.end - placed.start + 1)})` +
    (style.modifiers.length ? `\n${style.modifiers.join(' · ')}` : '') +
    (placed.event.note ? `\n\n${placed.event.note}` : '')

  return (
    <g
      className={classes.join(' ')}
      onClick={(e) => {
        if (wasPanning()) return
        e.stopPropagation()
        handlers.onSelect(placed.event)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        handlers.onOpen(placed.event)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        handlers.onContext(placed.event, e.clientX, e.clientY)
      }}
    >
      <title>{tip}</title>
      <polygon points={points} fill={fill} />
      {style.stripe &&
        placed.segments.map((seg, i) => {
          const ext = barExtent(seg.start, seg.endEx, toX)
          return (
            <rect
              key={i}
              className="bar__stripe"
              x={ext.x0}
              y={laneTop + seg.top + seg.height - 3}
              width={Math.max(MIN_BAR_PX, ext.x1 - ext.x0)}
              height={3}
              fill={textOn(fill)}
            />
          )
        })}
      {placed.event.ongoing && placed.end >= today - 1 && (
        <polygon
          className="bar__ongoing-cap"
          points={ongoingCap(toX(placed.end + 1), laneTop + last.top, last.height)}
          fill={fill}
        />
      )}
    </g>
  )
}

/** A small chevron on the right edge of an ongoing bar — shape, not colour. */
function ongoingCap(x: number, top: number, height: number): string {
  const h = Math.min(height, 14)
  const mid = top + height / 2
  return `${x},${mid - h / 2} ${x + h * 0.55},${mid} ${x},${mid + h / 2}`
}

// ---------------------------------------------------------------- backdrop

/**
 * A `layer: 'backdrop'` row that isn't pinned renders as a wash behind the
 * whole stack, carrying its label large and faint (§6.5). It occupies no
 * vertical space of its own.
 */
export const BackdropLayer = memo(function BackdropLayer({
  layouts,
  cam,
  width,
  tagsById,
}: {
  layouts: RowLayout[]
  cam: Camera
  width: number
  tagsById: Map<string, Tag>
}) {
  if (layouts.length === 0) return null
  return (
    <svg className="backdrop" width={width} aria-hidden="true" preserveAspectRatio="none">
      {layouts.flatMap((layout) =>
        layout.packed.placed.map((p) => {
          const { x0 } = barExtent(p.segments[0].start, p.segments[0].endEx, (d) => dayToX(d, cam))
          const lastSeg = p.segments.at(-1)!
          const { x1 } = barExtent(lastSeg.start, lastSeg.endEx, (d) => dayToX(d, cam))
          if (!isVisible(x0, x1, width)) return null
          const fill = styleFor(p.event, tagsById).fill
          const cx = (Math.max(0, x0) + Math.min(width, x1)) / 2
          const w = Math.min(width, x1) - Math.max(0, x0)
          return (
            <g key={`${layout.row.id}-${p.event.id}`}>
              <rect
                className="backdrop__wash"
                x={x0}
                y={0}
                width={Math.max(MIN_BAR_PX, x1 - x0)}
                height="100%"
                fill={fill}
              />
              <line className="backdrop__edge" x1={x0 + 0.5} y1={0} x2={x0 + 0.5} y2="100%" />
              {w > 90 && (
                <text className="backdrop__label" x={cx} y="42%" textAnchor="middle">
                  {p.event.label}
                </text>
              )}
            </g>
          )
        }),
      )}
    </svg>
  )
})

/**
 * A pinned backdrop row: the semantic twin of the grid header. Zoom out and
 * tick labels reinterpret from years to centuries while this band reinterprets
 * from "Cold War" to "Holocene" (§9.4).
 */
export const BackdropStrip = memo(function BackdropStrip({
  layout,
  cam,
  width,
  tagsById,
}: {
  layout: RowLayout
  cam: Camera
  width: number
  tagsById: Map<string, Tag>
}) {
  const h = layout.row.height
  return (
    <svg className="strip" width={width} height={h}>
      {layout.packed.placed.map((p) => {
        const toX = (d: number) => dayToX(d, cam)
        const { x0 } = barExtent(p.segments[0].start, p.segments[0].endEx, toX)
        const lastSeg = p.segments.at(-1)!
        const { x1 } = barExtent(lastSeg.start, lastSeg.endEx, toX)
        if (!isVisible(x0, x1, width)) return null
        const fill = styleFor(p.event, tagsById).fill
        const vx0 = Math.max(0, x0)
        const vx1 = Math.min(width, x1)
        const w = vx1 - vx0
        return (
          <g key={p.event.id} className="strip__item">
            <title>{`${p.event.label}\n${formatDayShort(p.start)} – ${formatDayShort(p.end)}`}</title>
            <rect x={x0} y={0} width={Math.max(MIN_BAR_PX, x1 - x0)} height={h} fill={fill} />
            <line className="strip__edge" x1={x0 + 0.5} y1={0} x2={x0 + 0.5} y2={h} />
            {w > 44 && (
              <text
                className="strip__label"
                x={vx0 + 6}
                y={h / 2 + 4}
                fill={textOn(fill)}
                fontSize={11}
              >
                {truncateToWidth(p.event.label, w - 12, 11)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
})
