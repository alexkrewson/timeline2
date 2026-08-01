/**
 * Document state, with undo/redo. Doc changes are user-driven and infrequent,
 * so a plain reducer in context is the right weight here.
 */

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import { makeRow, nowIso, normalizeEvent } from '../model/doc'
import type { RowConfig, Tag, TimelineDoc, TimelineEvent } from '../model/types'

export type DocAction =
  | { type: 'replace'; doc: TimelineDoc; resetHistory?: boolean }
  | { type: 'set-title'; title: string }
  | { type: 'set-birth-day'; day: number | null }
  | { type: 'add-event'; event: TimelineEvent }
  | { type: 'update-event'; event: TimelineEvent }
  | { type: 'delete-event'; id: string }
  | { type: 'add-tag'; tag: Tag }
  | { type: 'update-tag'; tag: Tag }
  | { type: 'delete-tag'; id: string }
  | { type: 'add-row'; row: RowConfig }
  | { type: 'update-row'; row: RowConfig }
  | { type: 'delete-row'; id: string }
  | { type: 'set-rows'; rows: RowConfig[] }
  | { type: 'toggle-tag-row'; tag: Tag }
  | { type: 'undo' }
  | { type: 'redo' }

export type DocState = {
  doc: TimelineDoc
  past: TimelineDoc[]
  future: TimelineDoc[]
  /** Bumped on every mutation; the autosave loop watches it. */
  revision: number
}

const HISTORY_LIMIT = 100

function touch(doc: TimelineDoc): TimelineDoc {
  return { ...doc, meta: { ...doc.meta, modified: nowIso() } }
}

function applyDoc(state: DocState, doc: TimelineDoc): DocState {
  return {
    doc: touch(doc),
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    revision: state.revision + 1,
  }
}

export function docReducer(state: DocState, action: DocAction): DocState {
  const { doc } = state
  switch (action.type) {
    case 'replace':
      return action.resetHistory
        ? { doc: action.doc, past: [], future: [], revision: state.revision + 1 }
        : applyDoc(state, action.doc)

    case 'set-title':
      return applyDoc(state, { ...doc, meta: { ...doc.meta, title: action.title } })

    case 'set-birth-day':
      if (doc.meta.birthDay === action.day) return state
      return applyDoc(state, { ...doc, meta: { ...doc.meta, birthDay: action.day } })

    case 'add-event':
      return applyDoc(state, { ...doc, events: [...doc.events, normalizeEvent(action.event)] })

    case 'update-event':
      return applyDoc(state, {
        ...doc,
        events: doc.events.map((e) => (e.id === action.event.id ? normalizeEvent(action.event) : e)),
      })

    case 'delete-event':
      return applyDoc(state, { ...doc, events: doc.events.filter((e) => e.id !== action.id) })

    case 'add-tag':
      return applyDoc(state, { ...doc, tags: [...doc.tags, action.tag] })

    case 'update-tag':
      return applyDoc(state, {
        ...doc,
        tags: doc.tags.map((t) => (t.id === action.tag.id ? action.tag : t)),
      })

    case 'delete-tag':
      return applyDoc(state, {
        ...doc,
        tags: doc.tags.filter((t) => t.id !== action.id),
        events: doc.events.map((e) => ({ ...e, tags: e.tags.filter((t) => t !== action.id) })),
        rows: doc.rows.filter(
          (r) => !(r.source.kind === 'tag' && r.source.tagIds.every((t) => t === action.id)),
        ),
      })

    case 'add-row':
      return applyDoc(state, { ...doc, rows: [...doc.rows, action.row] })

    case 'update-row':
      return applyDoc(state, {
        ...doc,
        rows: doc.rows.map((r) => (r.id === action.row.id ? action.row : r)),
      })

    case 'delete-row':
      return applyDoc(state, { ...doc, rows: doc.rows.filter((r) => r.id !== action.id) })

    case 'set-rows':
      return applyDoc(state, { ...doc, rows: action.rows })

    case 'toggle-tag-row': {
      const existing = doc.rows.find(
        (r) => r.source.kind === 'tag' && r.source.tagIds.includes(action.tag.id),
      )
      if (existing) {
        return applyDoc(state, { ...doc, rows: doc.rows.filter((r) => r.id !== existing.id) })
      }
      const order = Math.max(0, ...doc.rows.map((r) => r.order)) + 1
      const row = makeRow(action.tag.label, {
        source: { kind: 'tag', tagIds: [action.tag.id] },
        order,
      })
      return applyDoc(state, { ...doc, rows: [...doc.rows, row] })
    }

    case 'undo': {
      const prev = state.past.at(-1)
      if (!prev) return state
      return {
        doc: prev,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        revision: state.revision + 1,
      }
    }

    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        revision: state.revision + 1,
      }
    }
  }
}

const DocContext = createContext<DocState | null>(null)
const DispatchContext = createContext<Dispatch<DocAction> | null>(null)

export function DocProvider({ initial, children }: { initial: TimelineDoc; children: ReactNode }) {
  const [state, dispatch] = useReducer(docReducer, {
    doc: initial,
    past: [],
    future: [],
    revision: 0,
  })
  const value = useMemo(() => state, [state])
  return (
    <DocContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </DocContext.Provider>
  )
}

export function useDocState(): DocState {
  const s = useContext(DocContext)
  if (!s) throw new Error('useDocState outside DocProvider')
  return s
}

export function useDoc(): TimelineDoc {
  return useDocState().doc
}

export function useDocDispatch(): Dispatch<DocAction> {
  const d = useContext(DispatchContext)
  if (!d) throw new Error('useDocDispatch outside DocProvider')
  return d
}
