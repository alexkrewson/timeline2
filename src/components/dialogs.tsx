/** Export, crash recovery, about/help, and the bar context menu. */

import { useEffect, useMemo, useState } from 'react'
import { buildExportSvg, svgToPdf, svgToPng, type ExportTheme } from '../export/exportSvg'
import { effectiveEnd } from '../model/doc'
import { parseFlexibleDate } from '../model/parseDate'
import { downloadBlob } from '../model/persist'
import type { CorpusEvent, TimelineDoc, TimelineEvent } from '../model/types'
import { formatDayIso, formatDayShort } from '../time/format'
import { todayDay } from '../time/days'

// ------------------------------------------------------------------ export

type ExportProps = {
  doc: TimelineDoc
  corpus: CorpusEvent[]
  viewStart: number
  viewEnd: number
  onClose: () => void
}

export function ExportDialog({ doc, corpus, viewStart, viewEnd, onClose }: ExportProps) {
  const [format, setFormat] = useState<'svg' | 'png' | 'pdf'>('svg')
  const [from, setFrom] = useState(formatDayIso(Math.round(viewStart)))
  const [to, setTo] = useState(formatDayIso(Math.round(viewEnd)))
  const [rowIds, setRowIds] = useState(doc.rows.filter((r) => r.visible).map((r) => r.id))
  const [maxHeight, setMaxHeight] = useState(1400)
  const [width, setWidth] = useState(1600)
  const [density, setDensity] = useState<'all' | 'sparse'>('all')
  const [theme, setTheme] = useState<ExportTheme>('dark')
  const [dpi, setDpi] = useState(192)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscape(onClose)

  const range = useMemo(() => {
    const a = parseFlexibleDate(from, 'start')?.day ?? viewStart
    const b = parseFlexibleDate(to, 'end')?.day ?? viewEnd
    return a <= b ? { start: a, end: b } : { start: b, end: a }
  }, [from, to, viewStart, viewEnd])

  const preview = useMemo(
    () =>
      buildExportSvg(doc, corpus, {
        startDay: range.start,
        endDay: range.end,
        rowIds,
        widthPx: width,
        maxHeightPx: maxHeight,
        labelDensity: density,
        theme,
        gutterWidth: 150,
        title: doc.meta.title || 'Timeline',
      }),
    [doc, corpus, range, rowIds, width, maxHeight, density, theme],
  )

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const base = (doc.meta.title || 'timeline').replace(/[^\w -]+/g, '').trim() || 'timeline'
      if (format === 'svg') {
        downloadBlob(new Blob([preview.svg], { type: 'image/svg+xml' }), `${base}.svg`)
      } else if (format === 'png') {
        downloadBlob(await svgToPng(preview.svg, preview.width, preview.height, dpi), `${base}.png`)
      } else {
        downloadBlob(await svgToPdf(preview.svg, preview.width, preview.height), `${base}.pdf`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-card__head">
          <h2 className="modal-card__title">Export</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <span className="label">Format</span>
        <div className="mode-toggle">
          {(['svg', 'png', 'pdf'] as const).map((f) => (
            <button
              key={f}
              className={`mode-toggle__btn${format === f ? ' mode-toggle__btn--on' : ''}`}
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="side__grid">
          <label className="field-row">
            <span className="label">From</span>
            <input className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="field-echo">→ {formatDayShort(range.start)}</span>
          </label>
          <label className="field-row">
            <span className="label">To</span>
            <input className="field" value={to} onChange={(e) => setTo(e.target.value)} />
            <span className="field-echo">→ {formatDayShort(range.end)}</span>
          </label>
        </div>

        <span className="label">Rows</span>
        <div className="tag-cloud">
          {doc.rows.map((r) => {
            const on = rowIds.includes(r.id)
            return (
              <button
                key={r.id}
                className={`chip chip--btn${on ? ' chip--on' : ''}`}
                onClick={() =>
                  setRowIds((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))
                }
                aria-pressed={on}
              >
                {r.label}
              </button>
            )
          })}
        </div>

        <div className="side__grid">
          <label className="field-row">
            <span className="label">Width (px)</span>
            <input
              className="field field--num"
              type="number"
              min={400}
              max={8000}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value) || width)}
            />
          </label>
          <label className="field-row">
            <span className="label">Maximum height (px)</span>
            <input
              className="field field--num"
              type="number"
              min={200}
              max={20000}
              value={maxHeight}
              onChange={(e) => setMaxHeight(Number(e.target.value) || maxHeight)}
            />
          </label>
        </div>

        <div className="side__grid">
          <div className="field-row">
            <span className="label">Label density</span>
            <div className="mode-toggle">
              <button
                className={`mode-toggle__btn${density === 'all' ? ' mode-toggle__btn--on' : ''}`}
                onClick={() => setDensity('all')}
              >
                All labels
              </button>
              <button
                className={`mode-toggle__btn${density === 'sparse' ? ' mode-toggle__btn--on' : ''}`}
                onClick={() => setDensity('sparse')}
              >
                In-bar only
              </button>
            </div>
          </div>
          <div className="field-row">
            <span className="label">Theme</span>
            <div className="mode-toggle">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  className={`mode-toggle__btn${theme === t ? ' mode-toggle__btn--on' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {format === 'png' && (
          <label className="field-row">
            <span className="label">DPI</span>
            <input
              className="field field--num"
              type="number"
              min={72}
              max={600}
              step={24}
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value) || dpi)}
            />
          </label>
        )}

        <p className="settings-note">
          {preview.width} × {preview.height} px
          {preview.omittedRows > 0 &&
            ` · ${preview.omittedRows} row${
              preview.omittedRows === 1 ? '' : 's'
            } omitted to fit the maximum height`}
        </p>

        {error && <p className="error-inline">{error}</p>}

        <footer className="modal-card__foot">
          <div className="modal-card__actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || rowIds.length === 0} onClick={run}>
              {busy ? 'Working…' : `Export ${format.toUpperCase()}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- recovery

export function RecoveryDialog({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Recover autosave">
        <h2 className="modal-card__title">Unsaved work found</h2>
        <p>
          An autosave from <strong>{new Date(savedAt).toLocaleString()}</strong> is newer than the
          document that just loaded. Nothing has been changed yet — pick which one to keep.
        </p>
        <footer className="modal-card__foot">
          <div className="modal-card__actions">
            <button className="btn" onClick={onDiscard}>
              Keep the loaded document
            </button>
            <button className="btn-primary" onClick={onRestore}>
              Restore the autosave
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- about

const HELP_SECTIONS = [
  {
    id: 'entry',
    title: 'Entering events',
    body: [
      'N opens a new event from anywhere. Enter saves. Shift+Enter saves and reopens the form with the same tags — that is the bulk-entry path, so thirty friendships never need the mouse.',
      'Ctrl+D duplicates the selected event into a prefilled form. Double-click any bar to edit it. Right-click or long-press a bar for the same options.',
      'Dates are flexible: 2005, mar 2012, 2012-03-03, 3/3/2012, -3000, 540 mya. A partial date fills forward in the start field and backward in the end field, so 2005 means 1 January in Start and 31 December in End. The resolved date is echoed under the field before you save.',
      'Mark an event ongoing and its end is recomputed every time the file is opened, so a chart built today still reads correctly in five years.',
    ],
  },
  {
    id: 'zoom',
    title: 'Moving around',
    body: [
      'Ctrl+wheel or pinch zooms, anchored on the pointer — the day under the cursor stays under the cursor. One notch is the same proportional change at day scale and at billion-year scale.',
      'Drag left/right to pan, or shift+wheel. Plain wheel scrolls the rows vertically. The preset buttons are bookmarks, not the primary mechanism.',
      'Arrow keys pan, +/− zoom, Home returns to today.',
    ],
  },
  {
    id: 'rows',
    title: 'Rows are a view, not data',
    body: [
      'A row selects events by tag. The same event appears in every row whose filter matches it, which is intentional — switching between "one row per home" and "all homes in one lane" is a view change over identical data.',
      'Overlapping bars split the lane height instead of colliding, so a bar narrows mid-span when something else was going on. If a split would get thinner than the minimum sub-band, the lowest-priority event moves to a new lane instead.',
      'A backdrop row draws behind the stack as a wash — good for "Belgium", "the PDX years", "van life". Pin it and it becomes a header strip that reinterprets as you zoom, the same way the tick labels do.',
    ],
  },
  {
    id: 'files',
    title: 'Files and safety',
    body: [
      'A local JSON file is the source of truth. On Chromium desktop, Save writes straight back to the same file. Elsewhere it downloads, and Open reads a file you pick.',
      'Every 30 seconds the document is written to a crash buffer in this browser. If that buffer is newer than what you open, the app offers it — it never restores silently.',
      'Ctrl+S saves, Ctrl+O opens, Ctrl+Z / Ctrl+Shift+Z undo and redo.',
    ],
  },
  {
    id: 'time',
    title: 'How time is stored',
    body: [
      'Every date is an integer day count from 1 January 1970. Days across 14 billion years is about 5.1 × 10¹², which float64 holds exactly — so arithmetic is precise across the entire supported range.',
      'Calendar dates are proleptic Gregorian and only meaningful within roughly ±10,000 years of the epoch. Past that, and above the millennium zoom rung, the app shows years computed arithmetically instead. Year 0 is 1 BCE.',
    ],
  },
]

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(HELP_SECTIONS[0].id)
  useEscape(onClose)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--wide about"
        role="dialog"
        aria-modal="true"
        aria-label="About and help"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-card__head">
          <h2 className="modal-card__title">Timeline</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="about-page">
          <nav className="about-nav">
            {HELP_SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`about-nav-link${active === s.id ? ' about-nav-link--active' : ''}`}
                onClick={() => {
                  setActive(s.id)
                  document.getElementById(`help-${s.id}`)?.scrollIntoView({ block: 'start' })
                }}
              >
                {s.title}
              </button>
            ))}
          </nav>
          <div
            className="about-scroll"
            onScroll={(e) => {
              const top = (e.target as HTMLElement).scrollTop
              for (const s of HELP_SECTIONS) {
                const el = document.getElementById(`help-${s.id}`)
                if (el && el.offsetTop <= top + 40) setActive(s.id)
              }
            }}
          >
            <p className="about-lede">
              A zoomable, editable timeline. One data type — the event — with rows as a view over
              it. Everything stays on this device.
            </p>
            {HELP_SECTIONS.map((s) => (
              <section key={s.id} id={`help-${s.id}`}>
                <h3>{s.title}</h3>
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ context menu

export type ContextTarget = { event: TimelineEvent; x: number; y: number }

export function BarContextMenu({
  target,
  onEdit,
  onDuplicate,
  onDelete,
  onFrame,
  onClose,
}: {
  target: ContextTarget
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onFrame: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  useEscape(onClose)

  useEffect(() => {
    const close = () => onClose()
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [onClose])

  const today = todayDay()
  return (
    <div
      className="context-menu"
      style={{ left: target.x, top: target.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      role="menu"
      data-no-pan
    >
      <div className="context-menu__head">
        {target.event.label}
        <span className="context-menu__dates">
          {formatDayShort(target.event.start)} –{' '}
          {target.event.ongoing ? 'now' : formatDayShort(effectiveEnd(target.event, today))}
        </span>
      </div>
      <button className="context-menu__item" onClick={onEdit}>
        Edit
      </button>
      <button className="context-menu__item" onClick={onDuplicate}>
        Duplicate (Ctrl+D)
      </button>
      <button className="context-menu__item" onClick={onFrame}>
        Zoom to fit
      </button>
      {confirming ? (
        <div className="context-menu__confirm">
          <button className="btn btn--tiny" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button className="btn btn--tiny delete-btn" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : (
        <button
          className="context-menu__item context-menu__item--danger"
          onClick={() => setConfirming(true)}
        >
          Delete…
        </button>
      )}
    </div>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}
