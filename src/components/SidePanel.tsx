/**
 * Search, filters and row management (§10). Everything is client-side, so
 * search runs live per keystroke with in-place highlighting — this should feel
 * like adjusting, not querying.
 */

import { useMemo, useState } from 'react'
import { effectiveEnd } from '../model/doc'
import { parseFlexibleDate } from '../model/parseDate'
import type {
  RecMode,
  RowConfig,
  StyleChannel,
  Tag,
  TimelineDoc,
  TimelineEvent,
} from '../model/types'
import { formatDayShort } from '../time/format'

export type Filters = {
  query: string
  tagIds: string[]
  source: 'all' | 'personal' | 'corpus'
  from: string
  to: string
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  tagIds: [],
  source: 'all',
  from: '',
  to: '',
}

export function filtersActive(f: Filters): boolean {
  return Boolean(f.query.trim() || f.tagIds.length || f.source !== 'all' || f.from || f.to)
}

/** Predicate form of the filter set. `null` means "no filtering". */
export function makeFilter(f: Filters, today: number): ((e: TimelineEvent) => boolean) | null {
  if (!filtersActive(f)) return null
  const q = f.query.trim().toLowerCase()
  const want = new Set(f.tagIds)
  const from = f.from ? parseFlexibleDate(f.from, 'start')?.day : undefined
  const to = f.to ? parseFlexibleDate(f.to, 'end')?.day : undefined

  return (e) => {
    if (q && !e.label.toLowerCase().includes(q) && !e.note.toLowerCase().includes(q)) return false
    if (want.size && !e.tags.some((t) => want.has(t))) return false
    if (f.source !== 'all' && e.source !== f.source) return false
    if (from !== undefined && effectiveEnd(e, today) < from) return false
    if (to !== undefined && e.start > to) return false
    return true
  }
}

type Props = {
  doc: TimelineDoc
  today: number
  filters: Filters
  onFilters: (f: Filters) => void
  onToggleTagRow: (tag: Tag) => void
  onSelectEvent: (e: TimelineEvent) => void
  onEditEvent: (e: TimelineEvent) => void
  onUpdateRow: (row: RowConfig) => void
  onDeleteRow: (id: string) => void
  onMoveRow: (id: string, dir: -1 | 1) => void
  onUpdateTag: (tag: Tag) => void
  onDeleteTag: (id: string) => void
  corpusOn: boolean
  onCorpusOn: (on: boolean) => void
  recMode: RecMode
  onRecMode: (mode: RecMode) => void
  onClose: () => void
}

const REC_MODES: RecMode[] = ['off', 'prefer-matching', 'prefer-enclosing']
const REC_LABELS: Record<RecMode, string> = {
  off: 'Raw popularity',
  'prefer-matching': 'Matching this zoom',
  'prefer-enclosing': 'What era am I in',
}

/**
 * Tags do two jobs and must not be conflated (§8.2). A `fill` tag is a
 * selection tag — it decides which rows an event lands in. The others are
 * modifiers: they change how an existing bar draws without moving it, and each
 * owns one independent channel, so no two meanings ever share a signal.
 */
const CHANNELS: { value: StyleChannel; label: string; hint: string }[] = [
  { value: 'fill', label: 'Fill colour', hint: 'Selection tag — puts events in a row' },
  { value: 'saturation', label: 'Faded', hint: 'Modifier — e.g. dormant' },
  { value: 'stripe', label: 'Underline stripe', hint: 'Modifier — e.g. partner' },
  { value: 'outline', label: 'Dashed outline', hint: 'Modifier — e.g. uncertain' },
]

export function SidePanel(props: Props) {
  const [tab, setTab] = useState<'search' | 'rows' | 'tags' | 'context'>('search')
  const { doc, filters } = props

  const filter = useMemo(() => makeFilter(filters, props.today), [filters, props.today])
  const results = useMemo(
    () => (filter ? doc.events.filter(filter).slice(0, 200) : []),
    [doc.events, filter],
  )

  const rowsByTag = useMemo(() => {
    const map = new Map<string, RowConfig>()
    for (const r of doc.rows) {
      if (r.source.kind === 'tag') for (const t of r.source.tagIds) map.set(t, r)
    }
    return map
  }, [doc.rows])

  const sortedRows = useMemo(() => doc.rows.slice().sort((a, b) => a.order - b.order), [doc.rows])

  return (
    <aside className="side" data-no-pan>
      <div className="tab-bar">
        {(['search', 'rows', 'tags', 'context'] as const).map((t) => (
          <button
            key={t}
            className={`tab-btn${tab === t ? ' tab-btn--active' : ''}`}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button className="icon-btn side__close" onClick={props.onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      <div className="side__body">
        {tab === 'search' && (
          <>
            <input
              className="field"
              autoFocus
              value={filters.query}
              onChange={(e) => props.onFilters({ ...filters, query: e.target.value })}
              placeholder="Search labels and notes"
              aria-label="Search text"
            />
            <div className="side__grid">
              <label className="field-row">
                <span className="label">From</span>
                <input
                  className="field"
                  value={filters.from}
                  onChange={(e) => props.onFilters({ ...filters, from: e.target.value })}
                  placeholder="1990"
                />
              </label>
              <label className="field-row">
                <span className="label">To</span>
                <input
                  className="field"
                  value={filters.to}
                  onChange={(e) => props.onFilters({ ...filters, to: e.target.value })}
                  placeholder="2010"
                />
              </label>
            </div>

            <span className="label">Source</span>
            <div className="mode-toggle">
              {(['all', 'personal', 'corpus'] as const).map((s) => (
                <button
                  key={s}
                  className={`mode-toggle__btn${filters.source === s ? ' mode-toggle__btn--on' : ''}`}
                  onClick={() => props.onFilters({ ...filters, source: s })}
                  aria-pressed={filters.source === s}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            <span className="label">Tags — click to filter, ✚ to show as a row</span>
            <div className="tag-cloud">
              {doc.tags.map((t) => {
                const on = filters.tagIds.includes(t.id)
                const hasRow = rowsByTag.has(t.id)
                return (
                  <span key={t.id} className="tag-cloud__item">
                    <button
                      className={`chip chip--btn${on ? ' chip--on' : ''}`}
                      style={{ background: on ? t.color : 'transparent', borderColor: t.color }}
                      onClick={() =>
                        props.onFilters({
                          ...filters,
                          tagIds: on
                            ? filters.tagIds.filter((x) => x !== t.id)
                            : [...filters.tagIds, t.id],
                        })
                      }
                      aria-pressed={on}
                    >
                      {t.label}
                    </button>
                    <button
                      className={`chip__add${hasRow ? ' chip__add--on' : ''}`}
                      onClick={() => props.onToggleTagRow(t)}
                      title={hasRow ? 'Remove this row' : 'Add a row for this tag'}
                      aria-label={hasRow ? `Remove ${t.label} row` : `Add ${t.label} row`}
                    >
                      {hasRow ? '−' : '✚'}
                    </button>
                  </span>
                )
              })}
              {doc.tags.length === 0 && <p className="empty">No tags yet.</p>}
            </div>

            {filtersActive(filters) && (
              <>
                <div className="side__resulthead">
                  <span className="label">{results.length} matching</span>
                  <button className="btn btn--tiny" onClick={() => props.onFilters(EMPTY_FILTERS)}>
                    Clear
                  </button>
                </div>
                <ul className="result-list">
                  {results.map((e) => (
                    <li key={e.id}>
                      <button className="result" onClick={() => props.onSelectEvent(e)}>
                        <span className="result__label">{e.label}</span>
                        <span className="result__date">
                          {formatDayShort(e.start)}
                          {e.end !== e.start || e.ongoing
                            ? ` – ${e.ongoing ? 'now' : formatDayShort(e.end)}`
                            : ''}
                        </span>
                      </button>
                      <button
                        className="icon-btn icon-btn--tiny"
                        onClick={() => props.onEditEvent(e)}
                        aria-label={`Edit ${e.label}`}
                      >
                        ✎
                      </button>
                    </li>
                  ))}
                  {results.length === 0 && <p className="empty">Nothing matches yet.</p>}
                </ul>
              </>
            )}
          </>
        )}

        {tab === 'rows' && (
          <ul className="row-list">
            {sortedRows.map((row, i) => (
              <li key={row.id} className="row-list__item">
                <div className="row-list__head">
                  <input
                    className="field field--flush"
                    value={row.label}
                    onChange={(e) => props.onUpdateRow({ ...row, label: e.target.value })}
                    aria-label="Row label"
                  />
                  <button
                    className="icon-btn icon-btn--tiny"
                    onClick={() => props.onMoveRow(row.id, -1)}
                    disabled={i === 0}
                    aria-label="Move row up"
                  >
                    ↑
                  </button>
                  <button
                    className="icon-btn icon-btn--tiny"
                    onClick={() => props.onMoveRow(row.id, 1)}
                    disabled={i === sortedRows.length - 1}
                    aria-label="Move row down"
                  >
                    ↓
                  </button>
                </div>
                <div className="row-list__opts">
                  <label className="check-row check-row--tight">
                    <input
                      type="checkbox"
                      checked={row.visible}
                      onChange={(e) => props.onUpdateRow({ ...row, visible: e.target.checked })}
                    />
                    <span>Visible</span>
                  </label>
                  <label className="check-row check-row--tight">
                    <input
                      type="checkbox"
                      checked={row.pinned}
                      onChange={(e) => props.onUpdateRow({ ...row, pinned: e.target.checked })}
                    />
                    <span>Pinned</span>
                  </label>
                  <label className="check-row check-row--tight">
                    <input
                      type="checkbox"
                      checked={row.layer === 'backdrop'}
                      onChange={(e) =>
                        props.onUpdateRow({ ...row, layer: e.target.checked ? 'backdrop' : 'stack' })
                      }
                    />
                    <span>Backdrop</span>
                  </label>
                  <label className="check-row check-row--tight">
                    <input
                      type="checkbox"
                      checked={row.packing === 'auto'}
                      onChange={(e) =>
                        props.onUpdateRow({ ...row, packing: e.target.checked ? 'auto' : 'single' })
                      }
                    />
                    <span>One lane per overlap</span>
                  </label>
                  <label className="num-row">
                    <span className="label">Height</span>
                    <input
                      className="field field--num"
                      type="number"
                      min={8}
                      max={200}
                      value={row.height}
                      onChange={(e) =>
                        props.onUpdateRow({ ...row, height: Number(e.target.value) || row.height })
                      }
                    />
                  </label>
                  <button
                    className="btn btn--tiny delete-btn"
                    onClick={() => props.onDeleteRow(row.id)}
                  >
                    Remove row
                  </button>
                </div>
              </li>
            ))}
            {sortedRows.length === 0 && (
              <p className="empty">No rows yet — add one from a tag in the Search tab.</p>
            )}
          </ul>
        )}

        {tab === 'tags' && (
          <ul className="row-list">
            {doc.tags.map((tag) => (
              <li key={tag.id} className="row-list__item">
                <div className="row-list__head">
                  <input
                    className="field field--flush"
                    value={tag.label}
                    onChange={(e) => props.onUpdateTag({ ...tag, label: e.target.value })}
                    aria-label="Tag name"
                  />
                  <input
                    className="color-input"
                    type="color"
                    value={tag.color}
                    onChange={(e) => props.onUpdateTag({ ...tag, color: e.target.value })}
                    aria-label={`Colour for ${tag.label}`}
                  />
                  <button
                    className="icon-btn icon-btn--tiny delete-btn"
                    onClick={() => props.onDeleteTag(tag.id)}
                    aria-label={`Delete tag ${tag.label}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="row-list__opts">
                  <label className="num-row">
                    <span className="label">Channel</span>
                    <select
                      className="field field--flush"
                      value={tag.styleChannel}
                      onChange={(e) =>
                        props.onUpdateTag({
                          ...tag,
                          styleChannel: e.target.value as StyleChannel,
                        })
                      }
                    >
                      {CHANNELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="settings-note">
                    {CHANNELS.find((c) => c.value === tag.styleChannel)?.hint}
                  </p>
                </div>
              </li>
            ))}
            {doc.tags.length === 0 && (
              <p className="empty">No tags yet — create one while adding an event.</p>
            )}
            <p className="settings-note">
              One channel, one meaning. Modifiers stay legible without colour, so nothing here
              depends on hue alone.
            </p>
          </ul>
        )}

        {tab === 'context' && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={props.corpusOn}
                onChange={(e) => props.onCorpusOn(e.target.checked)}
              />
              <span>Show historical context from the bundled corpus</span>
            </label>
            <span className="label">What to surface</span>
            <input
              className="slider"
              type="range"
              min={0}
              max={2}
              step={1}
              value={REC_MODES.indexOf(props.recMode)}
              onChange={(e) => props.onRecMode(REC_MODES[Number(e.target.value)])}
              aria-label="Recommendation mode"
              disabled={!props.corpusOn}
            />
            <p className="settings-note">{REC_LABELS[props.recMode]}</p>
            <p className="settings-note">
              Personal events are always visible at every zoom and carry no rating. Significance
              exists only for corpus data.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
