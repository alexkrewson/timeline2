/**
 * The event form (§7). This is the primary entry path and it has to be faster
 * than typing a row into Excel: label autofocused, flexible dates echoed in
 * plain language, and Shift+Enter to save and reopen with the same tags for
 * bulk entry.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { makeEvent, makeTag } from '../model/doc'
import { parseFlexibleDate, type DateRole } from '../model/parseDate'
import type { Tag, TimelineEvent } from '../model/types'
import { nextPaletteColor } from '../styles/themes'
import { formatDayIso } from '../time/format'
import { todayDay } from '../time/days'

export type EventDialogRequest = {
  mode: 'new' | 'edit'
  event: TimelineEvent
  /** Tags carried over from the previous bulk-entry save. */
  keepTags?: boolean
}

type Props = {
  request: EventDialogRequest
  tags: Tag[]
  onSave: (event: TimelineEvent, again: boolean) => void
  onDelete?: (id: string) => void
  onCreateTag: (tag: Tag) => void
  onClose: () => void
}

function initialText(day: number, ongoing: boolean, role: DateRole): string {
  if (role === 'end' && ongoing) return ''
  return formatDayIso(day)
}

export function EventDialog({ request, tags, onSave, onDelete, onCreateTag, onClose }: Props) {
  const { event, mode } = request
  const [label, setLabel] = useState(event.label)
  const [ongoing, setOngoing] = useState(event.ongoing)
  const [startText, setStartText] = useState(() => initialText(event.start, false, 'start'))
  const [endText, setEndText] = useState(() => initialText(event.end, event.ongoing, 'end'))
  const [selectedTags, setSelectedTags] = useState<string[]>(event.tags)
  const [note, setNote] = useState(event.note)
  const [tagQuery, setTagQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    labelRef.current?.focus()
    labelRef.current?.select()
  }, [request])

  const parsedStart = useMemo(() => parseFlexibleDate(startText, 'start'), [startText])
  const parsedEnd = useMemo(
    () => (ongoing && !endText.trim() ? null : parseFlexibleDate(endText, 'end')),
    [endText, ongoing],
  )

  const startDay = parsedStart?.day ?? event.start
  const endDay = ongoing ? todayDay() : (parsedEnd?.day ?? startDay)
  const reversed = !ongoing && parsedEnd !== null && endDay < startDay
  const canSave = label.trim().length > 0 && parsedStart !== null

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const suggestions = useMemo(() => {
    const q = tagQuery.trim().toLowerCase()
    return tags
      .filter((t) => !selectedTags.includes(t.id))
      .filter((t) => !q || t.label.toLowerCase().includes(q))
      .slice(0, 8)
  }, [tags, tagQuery, selectedTags])

  const exactMatch = tags.find((t) => t.label.toLowerCase() === tagQuery.trim().toLowerCase())

  function build(): TimelineEvent {
    const start = startDay
    // An ongoing event's end is computed at render time, never stored (§7.4).
    const end = ongoing ? start : Math.max(start, parsedEnd?.day ?? start)
    return {
      ...event,
      label: label.trim(),
      start,
      end,
      ongoing,
      tags: selectedTags,
      note: note.trim(),
    }
  }

  function save(again: boolean) {
    if (!canSave) return
    onSave(build(), again)
    if (again) {
      setLabel('')
      setStartText('')
      setEndText('')
      setNote('')
      setOngoing(false)
      setTagQuery('')
      labelRef.current?.focus()
    }
  }

  function addTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = tags.find((t) => t.label.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      setSelectedTags((s) => (s.includes(existing.id) ? s : [...s, existing.id]))
    } else {
      const tag = makeTag(trimmed, nextPaletteColor(tags.map((t) => t.color)))
      onCreateTag(tag)
      setSelectedTags((s) => [...s, tag.id])
    }
    setTagQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Enter' && !(e.target as HTMLElement).matches('textarea')) {
      e.preventDefault()
      // Shift+Enter is the bulk-entry path: save and reopen with tags retained.
      save(e.shiftKey)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--form"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'new' ? 'New event' : 'Edit event'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="modal-card__head">
          <h2 className="modal-card__title">{mode === 'new' ? 'New event' : 'Edit event'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <label className="field-row">
          <span className="label">Label</span>
          <input
            ref={labelRef}
            className="field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What happened"
          />
        </label>

        <div className="field-grid">
          <label className="field-row">
            <span className="label">Start</span>
            <input
              className="field"
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              placeholder="2005 · mar 2012 · 3/3/2012 · 540 mya"
            />
            <span className={`field-echo${parsedStart ? '' : ' field-echo--empty'}`}>
              {startText.trim()
                ? parsedStart
                  ? `→ ${parsedStart.echo}`
                  : "→ can't read that date"
                : '→ required'}
            </span>
          </label>

          <label className="field-row">
            <span className="label">End</span>
            <input
              className="field"
              value={endText}
              onChange={(e) => setEndText(e.target.value)}
              disabled={ongoing}
              placeholder={ongoing ? 'today' : 'blank = same day as start'}
            />
            <span className={`field-echo${reversed ? ' field-echo--warn' : ''}`}>
              {ongoing
                ? '→ today, recomputed every time this file is opened'
                : endText.trim()
                  ? parsedEnd
                    ? reversed
                      ? `→ ${parsedEnd.echo} (before start — will be swapped)`
                      : `→ ${parsedEnd.echo}`
                    : "→ can't read that date"
                  : '→ same day as start (instantaneous)'}
            </span>
          </label>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} />
          <span>Ongoing — extends to today, so the chart never goes stale</span>
        </label>

        <div className="field-row">
          <span className="label">Tags</span>
          <div className="tag-input">
            {selectedTags.map((id) => {
              const tag = tagsById.get(id)
              if (!tag) return null
              return (
                <span className="chip" key={id} style={{ background: tag.color }}>
                  {tag.label}
                  <button
                    className="chip__x"
                    onClick={() => setSelectedTags((s) => s.filter((t) => t !== id))}
                    aria-label={`Remove tag ${tag.label}`}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            <input
              className="tag-input__field"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagQuery.trim()) {
                  e.preventDefault()
                  e.stopPropagation()
                  addTag(suggestions[0]?.label ?? tagQuery)
                } else if (e.key === 'Backspace' && !tagQuery) {
                  setSelectedTags((s) => s.slice(0, -1))
                }
              }}
              placeholder={selectedTags.length ? '' : 'type to search or create'}
            />
          </div>
          {tagQuery.trim() && (
            <div className="tag-suggest" data-no-pan>
              {suggestions.map((t) => (
                <button key={t.id} className="tag-suggest__item" onClick={() => addTag(t.label)}>
                  <span className="swatch" style={{ background: t.color }} />
                  {t.label}
                </button>
              ))}
              {!exactMatch && (
                <button className="tag-suggest__item" onClick={() => addTag(tagQuery)}>
                  <span className="swatch swatch--new" />
                  Create “{tagQuery.trim()}”
                </button>
              )}
            </div>
          )}
        </div>

        <label className="field-row">
          <span className="label">Note</span>
          <textarea
            className="field field--area"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Not rendered on the chart"
          />
        </label>

        <footer className="modal-card__foot">
          {mode === 'edit' && onDelete && (
            <div className="delete-zone">
              {confirmDelete ? (
                <div className="delete-confirm-btns">
                  <button className="btn" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                  <button className="btn delete-btn" onClick={() => onDelete(event.id)}>
                    Delete for real
                  </button>
                </div>
              ) : (
                <button className="btn delete-btn" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              )}
            </div>
          )}
          <div className="modal-card__actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" disabled={!canSave} onClick={() => save(true)}>
              Save + new
            </button>
            <button className="btn-primary" disabled={!canSave} onClick={() => save(false)}>
              Save
            </button>
          </div>
        </footer>
        <p className="modal-card__hint">
          Enter saves · Shift+Enter saves and opens a fresh form with these tags · Esc cancels
        </p>
      </div>
    </div>
  )
}

/** A blank event pre-seeded with tags carried over from a bulk-entry session. */
export function newEventRequest(tags: string[] = [], start = todayDay()): EventDialogRequest {
  return { mode: 'new', event: makeEvent({ start, end: start, tags }), keepTags: true }
}
