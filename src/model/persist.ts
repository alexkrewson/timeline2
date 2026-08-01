/**
 * Persistence (§8.4). A local JSON file is the source of truth.
 *
 * File System Access API where available (Chromium desktop) so re-saving hits
 * the same file with no download dialog; download/upload fallback everywhere
 * else. IndexedDB holds a 30s crash buffer — offered for recovery on load,
 * never silently restored.
 */

import { loadDoc, nowIso } from './doc'
import type { TimelineDoc } from './types'

const DB_NAME = 'timeline'
const DB_VERSION = 1
const STORE = 'kv'
const KEY_BUFFER = 'crash-buffer'
const KEY_HANDLE = 'file-handle'

export const AUTOSAVE_INTERVAL_MS = 30_000

// --- minimal IndexedDB kv store (no dependency) ---------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  const out = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return out
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

// --- crash buffer ---------------------------------------------------------

export type CrashBuffer = { savedAt: string; doc: TimelineDoc }

export async function writeCrashBuffer(doc: TimelineDoc): Promise<void> {
  await idbSet(KEY_BUFFER, { savedAt: nowIso(), doc } satisfies CrashBuffer)
}

export async function readCrashBuffer(): Promise<CrashBuffer | undefined> {
  try {
    return await idbGet<CrashBuffer>(KEY_BUFFER)
  } catch {
    return undefined
  }
}

export async function clearCrashBuffer(): Promise<void> {
  try {
    await idbDelete(KEY_BUFFER)
  } catch {
    /* nothing to clear */
  }
}

/** True when the buffer is newer than the document's own modified stamp. */
export function bufferIsNewer(buffer: CrashBuffer, doc: TimelineDoc | null): boolean {
  if (!doc) return true
  const docTime = Date.parse(doc.meta.modified || doc.meta.created || '')
  const bufTime = Date.parse(buffer.savedAt)
  if (Number.isNaN(bufTime)) return false
  if (Number.isNaN(docTime)) return true
  return bufTime > docTime + 1000
}

// --- File System Access API ----------------------------------------------

type FsHandle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>
}

type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>
}

export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window
}

const PICKER_TYPES = [
  { description: 'Timeline document', accept: { 'application/json': ['.timeline.json', '.json'] } },
]

function serialize(doc: TimelineDoc): string {
  return JSON.stringify({ ...doc, meta: { ...doc.meta, modified: nowIso() } }, null, 2)
}

function suggestedName(doc: TimelineDoc): string {
  const base = (doc.meta.title || 'timeline').replace(/[^\w -]+/g, '').trim() || 'timeline'
  return `${base}.timeline.json`
}

let currentHandle: FsHandle | null = null

export function currentFileName(): string | null {
  return currentHandle?.name ?? null
}

export function hasOpenFile(): boolean {
  return currentHandle !== null
}

async function ensurePermission(handle: FsHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  return (await handle.requestPermission?.({ mode })) === 'granted'
}

/** Restore the last file handle from IndexedDB. Returns the file name if usable. */
export async function restoreHandle(): Promise<string | null> {
  if (!hasFileSystemAccess()) return null
  try {
    const handle = await idbGet<FsHandle>(KEY_HANDLE)
    if (!handle) return null
    if (!(await ensurePermission(handle, 'readwrite'))) return null
    currentHandle = handle
    return handle.name
  } catch {
    return null
  }
}

export async function readCurrentFile(): Promise<TimelineDoc | null> {
  if (!currentHandle) return null
  const file = await currentHandle.getFile()
  return loadDoc(JSON.parse(await file.text())).doc
}

/** Save to the already-open file, or fall back to Save As / download. */
export async function save(doc: TimelineDoc): Promise<'saved' | 'downloaded'> {
  if (currentHandle) {
    if (!(await ensurePermission(currentHandle, 'readwrite'))) {
      currentHandle = null
      return save(doc)
    }
    const w = await currentHandle.createWritable()
    await w.write(serialize(doc))
    await w.close()
    return 'saved'
  }
  return saveAs(doc)
}

export async function saveAs(doc: TimelineDoc): Promise<'saved' | 'downloaded'> {
  const w = window as PickerWindow
  if (w.showSaveFilePicker) {
    const handle = await w.showSaveFilePicker({
      suggestedName: suggestedName(doc),
      types: PICKER_TYPES,
    })
    currentHandle = handle
    await idbSet(KEY_HANDLE, handle).catch(() => {})
    return save(doc)
  }
  downloadDoc(doc)
  return 'downloaded'
}

export function downloadDoc(doc: TimelineDoc): void {
  downloadBlob(new Blob([serialize(doc)], { type: 'application/json' }), suggestedName(doc))
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type OpenResult = { doc: TimelineDoc; repairs: string[]; name: string }

export async function open(): Promise<OpenResult | null> {
  const w = window as PickerWindow
  if (w.showOpenFilePicker) {
    const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
    if (!handle) return null
    currentHandle = handle
    await idbSet(KEY_HANDLE, handle).catch(() => {})
    const file = await handle.getFile()
    const { doc, repairs } = loadDoc(JSON.parse(await file.text()))
    return { doc, repairs, name: handle.name }
  }
  return openViaInput()
}

function openViaInput(): Promise<OpenResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const { doc, repairs } = loadDoc(JSON.parse(await file.text()))
        currentHandle = null
        resolve({ doc, repairs, name: file.name })
      } catch (err) {
        reject(err)
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export function forgetFile(): void {
  currentHandle = null
  idbDelete(KEY_HANDLE).catch(() => {})
}
