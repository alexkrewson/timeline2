import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Axis, BackdropLayer, BackdropStrip, ChartRow, type BarHandlers } from './components/Chart'
import {
  AboutDialog,
  BarContextMenu,
  ExportDialog,
  RecoveryDialog,
  type ContextTarget,
} from './components/dialogs'
import { EventDialog, newEventRequest, type EventDialogRequest } from './components/EventDialog'
import { EMPTY_FILTERS, makeFilter, SidePanel, type Filters } from './components/SidePanel'
import { Toolbar } from './components/Toolbar'
import { usePanZoom } from './hooks/usePanZoom'
import { useRowMotion } from './hooks/useRowMotion'
import { effectiveEnd, makeEvent, makeRow, starterDoc } from './model/doc'
import * as persist from './model/persist'
import type { CorpusEvent, RowConfig, Tag, TimelineDoc, TimelineEvent } from './model/types'
import { planLabels } from './render/labels'
import { layoutRow, type RowLayout } from './render/layout'
import { DocProvider, useDocDispatch, useDocState } from './state/docStore'
import {
  animateCamera,
  frameRange,
  getCameraState,
  setCamera,
  setChartWidth,
  useCameraState,
} from './state/camera'
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from './state/prefs'
import { todayDay } from './time/days'
import { formatDuration } from './time/format'
import { panByPx, viewRange, zoomAt, type Camera } from './time/scale'

export default function App() {
  const [initial] = useState(() => starterDoc())
  return (
    <DocProvider initial={initial}>
      <Workspace />
    </DocProvider>
  )
}

const CORPUS_ROW_ID = '__corpus'

function Workspace() {
  const { doc, past, future, revision } = useDocState()
  const dispatch = useDocDispatch()
  const { cam, width } = useCameraState()
  const today = useMemo(() => todayDay(), [])

  const [prefs, setPrefsState] = useState(loadPrefs)
  const [corpus, setCorpus] = useState<CorpusEvent[]>([])
  const [dialog, setDialog] = useState<EventDialogRequest | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [exportOpen, setExportOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<persist.CrashBuffer | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const chartRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const savedRevision = useRef(0)

  const dirty = revision !== savedRevision.current

  // ---------------------------------------------------------------- prefs
  useEffect(() => {
    applyPrefs(prefs)
  }, [prefs])

  const setPrefs = useCallback((next: Prefs) => {
    setPrefsState(next)
    savePrefs(next)
  }, [])

  // --------------------------------------------------------------- corpus
  useEffect(() => {
    if (!prefs.corpusOn || corpus.length > 0) return
    let cancelled = false
    import('./data/corpus')
      .then((m) => !cancelled && setCorpus(m.CORPUS))
      .catch(() => setStatus('Could not load the historical corpus.'))
    return () => {
      cancelled = true
    }
  }, [prefs.corpusOn, corpus.length])

  // ------------------------------------------------------ measure & pan
  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width))
    ro.observe(el)
    setChartWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const plotLeft = useCallback(() => plotRef.current?.getBoundingClientRect().left ?? 0, [])
  usePanZoom(chartRef, { plotLeft })

  // ------------------------------------------------------------- autosave
  useEffect(() => {
    const id = window.setInterval(() => {
      if (revision !== savedRevision.current) void persist.writeCrashBuffer(doc)
    }, persist.AUTOSAVE_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [doc, revision])

  // Offer the crash buffer on first load — never restore silently.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const name = await persist.restoreHandle()
      if (!cancelled && name) setFileName(name)
      const buffer = await persist.readCrashBuffer()
      if (!cancelled && buffer && persist.bufferIsNewer(buffer, null)) setRecovery(buffer)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!status) return
    const id = window.setTimeout(() => setStatus(null), 4000)
    return () => window.clearTimeout(id)
  }, [status])

  // --------------------------------------------------------------- layout
  const view = useMemo(() => viewRange(cam, width), [cam, width])

  const corpusRow: RowConfig | null = useMemo(() => {
    if (!prefs.corpusOn || corpus.length === 0) return null
    const enclosing = prefs.recMode === 'prefer-enclosing'
    return makeRow('context', {
      id: CORPUS_ROW_ID,
      source: { kind: 'corpus', mode: prefs.recMode, maxRows: enclosing ? 3 : 6 },
      packing: 'auto',
      maxLanes: enclosing ? 3 : 6,
      height: enclosing ? 20 : 18,
      layer: enclosing ? 'backdrop' : 'stack',
      pinned: enclosing,
      order: -1,
    })
  }, [prefs.corpusOn, prefs.recMode, corpus.length])

  const rowCtx = useMemo(
    () => ({ doc, corpus, viewStart: view.start, viewEnd: view.end, today, filter: null }),
    [doc, corpus, view.start, view.end, today],
  )

  const layouts = useMemo(() => {
    const rows = [...doc.rows, ...(corpusRow ? [corpusRow] : [])].filter((r) => r.visible)
    return rows
      .map((row) => layoutRow(row, rowCtx))
      .sort(
        (a, b) =>
          a.row.order - b.row.order ||
          (a.events[0]?.start ?? Infinity) - (b.events[0]?.start ?? Infinity) ||
          (a.row.id < b.row.id ? -1 : 1),
      )
  }, [doc.rows, corpusRow, rowCtx])

  const pinned = layouts.filter((l) => l.row.pinned)
  const scrolling = layouts.filter((l) => !l.row.pinned)
  const backdrops = scrolling.filter((l) => l.row.layer === 'backdrop')
  const stack = scrolling.filter((l) => l.row.layer !== 'backdrop')

  const tagsById = useMemo(() => new Map(doc.tags.map((t) => [t.id, t])), [doc.tags])

  // Search highlights in place rather than removing rows (§10).
  const matches = useMemo(() => {
    const f = makeFilter(filters, today)
    if (!f) return null
    const ids = new Set<string>()
    for (const e of doc.events) if (f(e)) ids.add(e.id)
    for (const e of corpus) if (f(e)) ids.add(e.id)
    return ids
  }, [filters, doc.events, corpus, today])

  const { chip, dismissChip, scrollToRow } = useRowMotion(
    scrollRef,
    contentRef,
    stack.map((l) => l.row.id),
  )

  // ------------------------------------------------------------- commands
  const openNew = useCallback(
    (tags: string[] = []) => {
      setDialog(newEventRequest(tags, Math.round(getCameraState().cam.leftDay)))
    },
    [],
  )

  const duplicate = useCallback((event: TimelineEvent) => {
    const { id: _id, ...rest } = event
    setDialog({ mode: 'new', event: makeEvent({ ...rest, label: `${event.label} (copy)` }) })
  }, [])

  const saveFile = useCallback(async () => {
    try {
      const how = await persist.save(doc)
      savedRevision.current = revision
      setFileName(persist.currentFileName())
      await persist.clearCrashBuffer()
      setStatus(how === 'saved' ? 'Saved.' : 'Downloaded a copy.')
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      setStatus(err instanceof Error ? err.message : 'Could not save.')
    }
  }, [doc, revision])

  const openFile = useCallback(async () => {
    try {
      const result = await persist.open()
      if (!result) return
      dispatch({ type: 'replace', doc: result.doc, resetHistory: true })
      savedRevision.current = revision + 1
      setFileName(result.name)
      setStatus(
        result.repairs.length
          ? `Opened with ${result.repairs.length} repair(s): ${result.repairs[0]}`
          : `Opened ${result.name}.`,
      )
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      setStatus(err instanceof Error ? err.message : 'Could not open that file.')
    }
  }, [dispatch, revision])

  const newFile = useCallback(() => {
    persist.forgetFile()
    dispatch({ type: 'replace', doc: starterDoc(), resetHistory: true })
    setFileName(null)
    setStatus('Started a new timeline.')
  }, [dispatch])

  const selectEvent = useCallback((event: TimelineEvent) => {
    setSelectedId(event.id)
  }, [])

  const handlers: BarHandlers = useMemo(
    () => ({
      onSelect: selectEvent,
      onOpen: (event) => setDialog({ mode: 'edit', event }),
      onContext: (event, x, y) => {
        setSelectedId(event.id)
        setContextTarget({ event, x, y })
      },
    }),
    [selectEvent],
  )

  const saveEvent = useCallback(
    (event: TimelineEvent, again: boolean) => {
      const isNew = !doc.events.some((e) => e.id === event.id)
      dispatch(isNew ? { type: 'add-event', event } : { type: 'update-event', event })
      setSelectedId(event.id)
      if (again) setDialog(newEventRequest(event.tags, event.start))
      else setDialog(null)
    },
    [dispatch, doc.events],
  )

  const moveRow = useCallback(
    (id: string, dir: -1 | 1) => {
      const sorted = doc.rows.slice().sort((a, b) => a.order - b.order)
      const i = sorted.findIndex((r) => r.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= sorted.length) return
      ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
      dispatch({ type: 'set-rows', rows: sorted.map((r, k) => ({ ...r, order: k })) })
    },
    [dispatch, doc.rows],
  )

  // ------------------------------------------------------------ shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.target is not always an Element — it can be the document itself.
      const el = e.target as HTMLElement | null
      const typing =
        typeof el?.matches === 'function' &&
        el.matches('input, textarea, [contenteditable="true"]')
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveFile()
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openFile()
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        const event = doc.events.find((x) => x.id === selectedId)
        if (event) {
          e.preventDefault()
          duplicate(event)
        }
        return
      }
      if (typing || dialog) return

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          openNew()
          break
        case 'f':
        case 'F':
          setSideOpen((s) => !s)
          break
        case 'Escape':
          setSelectedId(null)
          setContextTarget(null)
          break
        case 'ArrowLeft':
          setCamera(panByPx(getCameraState().cam, e.shiftKey ? 200 : 60))
          break
        case 'ArrowRight':
          setCamera(panByPx(getCameraState().cam, e.shiftKey ? -200 : -60))
          break
        case '+':
        case '=':
          setCamera(zoomAt(getCameraState().cam, getCameraState().width / 2, 2))
          break
        case '-':
        case '_':
          setCamera(zoomAt(getCameraState().cam, getCameraState().width / 2, -2))
          break
        case 'Home':
          frameRange(today - 365 * 20, today + 365 * 2)
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog, dispatch, doc.events, duplicate, openFile, openNew, saveFile, selectedId, today])

  // Warn before losing unsaved work on close.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const spanLabel = formatDuration(view.end - view.start)

  return (
    <div className="app">
      <Toolbar
        title={doc.meta.title}
        onTitleChange={(title) => dispatch({ type: 'set-title', title })}
        fileName={fileName}
        dirty={dirty}
        cam={cam}
        width={width}
        prefs={prefs}
        onPrefs={setPrefs}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onNew={newFile}
        onOpen={() => void openFile()}
        onSave={() => void saveFile()}
        onSaveAs={() => void persist.saveAs(doc).then(() => setFileName(persist.currentFileName()))}
        onNewEvent={() => openNew()}
        onExport={() => setExportOpen(true)}
        onToggleSearch={() => setSideOpen((s) => !s)}
        searchOpen={sideOpen}
        onZoom={(n) => animateCamera(zoomAt(getCameraState().cam, getCameraState().width / 2, n), 160)}
        onAbout={() => setAboutOpen(true)}
      />

      <div className="app__main">
        {sideOpen && (
          <SidePanel
            doc={doc}
            today={today}
            filters={filters}
            onFilters={setFilters}
            onToggleTagRow={(tag: Tag) => dispatch({ type: 'toggle-tag-row', tag })}
            onSelectEvent={(e) => {
              setSelectedId(e.id)
              frameRange(e.start, effectiveEnd(e, today) + 1)
            }}
            onEditEvent={(event) => setDialog({ mode: 'edit', event })}
            onUpdateRow={(row) => dispatch({ type: 'update-row', row })}
            onDeleteRow={(id) => dispatch({ type: 'delete-row', id })}
            onMoveRow={moveRow}
            onUpdateTag={(tag) => dispatch({ type: 'update-tag', tag })}
            onDeleteTag={(id) => dispatch({ type: 'delete-tag', id })}
            corpusOn={prefs.corpusOn}
            onCorpusOn={(on) => setPrefs({ ...prefs, corpusOn: on })}
            recMode={prefs.recMode}
            onRecMode={(recMode) => setPrefs({ ...prefs, recMode })}
            onClose={() => setSideOpen(false)}
          />
        )}

        <div className="chart" ref={chartRef}>
          <div className="chart__head">
            <div className="chart__gutter chart__gutter--head">
              <span className="label">view span</span>
              <span className="chart__span">{spanLabel}</span>
            </div>
            <div className="chart__plot" ref={plotRef}>
              <Axis cam={cam} width={width} today={today} />
            </div>
          </div>

          {pinned.length > 0 && (
            <div className="chart__pinned">
              {pinned.map((layout) => (
                <PinnedRow
                  key={layout.row.id}
                  layout={layout}
                  cam={cam}
                  width={width}
                  tagsById={tagsById}
                  selectedId={selectedId}
                  matches={matches}
                  today={today}
                  handlers={handlers}
                />
              ))}
            </div>
          )}

          <div className="chart__scroll" ref={scrollRef}>
            <div className="chart__content" ref={contentRef}>
              <div className="chart__backdrop">
                <BackdropLayer layouts={backdrops} cam={cam} width={width} tagsById={tagsById} />
              </div>
              {stack.map((layout) => (
                <StackRow
                  key={layout.row.id}
                  layout={layout}
                  cam={cam}
                  width={width}
                  tagsById={tagsById}
                  selectedId={selectedId}
                  matches={matches}
                  today={today}
                  handlers={handlers}
                />
              ))}
              {stack.length === 0 && (
                <p className="empty empty--chart">
                  No rows yet. Open Search and add a row from a tag, or press N to add an event.
                </p>
              )}
            </div>
          </div>

          {chip && (
            <button
              className={`edge-chip edge-chip--${chip.dir}`}
              onClick={() => scrollToRow(chip.targetId)}
              onAuxClick={dismissChip}
            >
              {chip.dir === 'up' ? '↑' : '↓'} {chip.count} row{chip.count === 1 ? '' : 's'} added
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className="error-bar">
          <span>{status}</span>
          <button onClick={() => setStatus(null)}>Dismiss</button>
        </div>
      )}

      {dialog && (
        <EventDialog
          request={dialog}
          tags={doc.tags}
          onSave={saveEvent}
          onDelete={(id) => {
            dispatch({ type: 'delete-event', id })
            setDialog(null)
            setSelectedId(null)
          }}
          onCreateTag={(tag) => dispatch({ type: 'add-tag', tag })}
          onClose={() => setDialog(null)}
        />
      )}

      {contextTarget && (
        <BarContextMenu
          target={contextTarget}
          onEdit={() => {
            setDialog({ mode: 'edit', event: contextTarget.event })
            setContextTarget(null)
          }}
          onDuplicate={() => {
            duplicate(contextTarget.event)
            setContextTarget(null)
          }}
          onFrame={() => {
            frameRange(contextTarget.event.start, effectiveEnd(contextTarget.event, today) + 1)
            setContextTarget(null)
          }}
          onDelete={() => {
            dispatch({ type: 'delete-event', id: contextTarget.event.id })
            setContextTarget(null)
          }}
          onClose={() => setContextTarget(null)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          doc={doc}
          corpus={corpus}
          viewStart={view.start}
          viewEnd={view.end}
          onClose={() => setExportOpen(false)}
        />
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}

      {recovery && (
        <RecoveryDialog
          savedAt={recovery.savedAt}
          onRestore={() => {
            dispatch({ type: 'replace', doc: recovery.doc as TimelineDoc, resetHistory: true })
            setRecovery(null)
            setStatus('Restored the autosaved document.')
          }}
          onDiscard={() => {
            void persist.clearCrashBuffer()
            setRecovery(null)
          }}
        />
      )}
    </div>
  )
}

type RowProps = {
  layout: RowLayout
  cam: Camera
  width: number
  tagsById: Map<string, Tag>
  selectedId: string | null
  matches: Set<string> | null
  today: number
  handlers: BarHandlers
}

function useLabelPlan(layout: RowLayout, cam: Camera, width: number) {
  return useMemo(
    () =>
      planLabels(layout, {
        toX: (day: number) => (day - cam.leftDay) * Math.exp(cam.logScale),
        width,
      }),
    [layout, cam, width],
  )
}

function StackRow(props: RowProps) {
  const plan = useLabelPlan(props.layout, props.cam, props.width)
  const { row, packed } = props.layout
  return (
    <div className="row" data-row-id={row.id}>
      <div className="row__gutter">
        <span className="row__label">
          {row.label}
          {plan.gutterAbsorbed && <span className="row__absorbed"> — {plan.gutterAbsorbed}</span>}
        </span>
        {packed.spilled && (
          <span
            className="row__flag"
            title={`This row needed ${packed.laneCount} lanes, past its soft cap of ${row.maxLanes}. Data error, or something you'd forgotten?`}
          >
            ⚠ {packed.laneCount} lanes
          </span>
        )}
      </div>
      <div className="row__plot">
        <ChartRow {...props} plan={plan} />
      </div>
    </div>
  )
}

function PinnedRow(props: RowProps) {
  const { row } = props.layout
  if (row.layer === 'backdrop') {
    return (
      <div className="row row--strip" data-row-id={row.id}>
        <div className="row__gutter">
          <span className="row__label">{row.label}</span>
        </div>
        <div className="row__plot">
          <BackdropStrip
            layout={props.layout}
            cam={props.cam}
            width={props.width}
            tagsById={props.tagsById}
          />
        </div>
      </div>
    )
  }
  return <StackRow {...props} />
}
