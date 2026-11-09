/**
 * Thin layer over the File System Access API with a fallback for browsers that lack it.
 * Handles are kept in IndexedDB so a diagram stays linked to its file across reloads.
 */

interface PickerType {
  description?: string
  accept: Record<string, string[]>
}

interface PickerOptions {
  id?: string
  types?: PickerType[]
  suggestedName?: string
  excludeAcceptAllOption?: boolean
}

interface PickerWindow {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>
}

interface PermissionHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

/** Files the app opens: DBML, plain text holding DBML, and SQL for the import. */
export const OPENABLE = ['.dbml', '.sql', '.txt']

export interface PickedFile {
  name: string
  text: string
  lastModified: number
  /** Null when the browser only offers the classic file input. */
  handle: FileSystemFileHandle | null
}

const DBML_TYPE: PickerType = {
  description: 'DBML schema',
  accept: { 'text/plain': ['.dbml', '.txt'] },
}
const OPEN_TYPE: PickerType = {
  description: 'DBML or SQL',
  accept: { 'text/plain': OPENABLE },
}
const PICKER_ID = 'keyline-dbml'

const picker = (): PickerWindow => window as unknown as PickerWindow

export function supportsFileHandles(): boolean {
  return typeof window !== 'undefined' && typeof picker().showSaveFilePicker === 'function'
}

/** Short fingerprint of a text, to tell whether it still matches the file on disk. */
export function textHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return `${(hash >>> 0).toString(36)}-${text.length.toString(36)}`
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Lets the user choose a file. Resolves to null when they cancel. */
export async function pickFile(): Promise<PickedFile | null> {
  const open = picker().showOpenFilePicker
  if (open) {
    try {
      const [handle] = await open({ id: PICKER_ID, types: [OPEN_TYPE] })
      if (!handle) return null
      const file = await handle.getFile()
      return { name: file.name, text: await file.text(), lastModified: file.lastModified, handle }
    } catch (error) {
      if (isAbort(error)) return null
      throw error
    }
  }
  return pickWithInput()
}

function pickWithInput(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = [...OPENABLE, 'text/plain'].join(',')
    input.style.display = 'none'
    const finish = (value: PickedFile | null) => {
      input.remove()
      resolve(value)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      file
        .text()
        .then((text) =>
          finish({ name: file.name, text, lastModified: file.lastModified, handle: null }),
        )
        .catch(() => finish(null))
    })
    // Cancelling the dialog fires no change event; the window regaining focus is the cue.
    input.addEventListener('cancel', () => finish(null))
    document.body.append(input)
    input.click()
  })
}

/** Asks where to save. Resolves to null when cancelled or when the API is missing. */
export async function pickSaveTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const save = picker().showSaveFilePicker
  if (!save) return null
  try {
    return await save({ id: PICKER_ID, suggestedName, types: [DBML_TYPE] })
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export async function writeFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

export async function readFile(
  handle: FileSystemFileHandle,
): Promise<{ text: string; lastModified: number }> {
  const file = await handle.getFile()
  return { text: await file.text(), lastModified: file.lastModified }
}

/** True when the file can be read right now, without asking the user again. */
export async function canReadQuietly(handle: FileSystemFileHandle): Promise<boolean> {
  const query = (handle as unknown as PermissionHandle).queryPermission
  if (!query) return true
  return (await query.call(handle, { mode: 'read' })) === 'granted'
}

export async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const permissions = handle as unknown as PermissionHandle
  const query = permissions.queryPermission
  const request = permissions.requestPermission
  if (!query || !request) return true
  if ((await query.call(handle, { mode: 'readwrite' })) === 'granted') return true
  return (await request.call(handle, { mode: 'readwrite' })) === 'granted'
}

// ---------------------------------------------------------------- handle store

const DB_NAME = 'keyline-files'
const STORE = 'handles'

function openStore(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function settle<T>(request: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
}

export async function loadHandles(): Promise<Map<string, FileSystemFileHandle>> {
  const result = new Map<string, FileSystemFileHandle>()
  const db = await openStore()
  if (!db) return result
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const keys = (await settle(store.getAllKeys())) ?? []
  const values = (await settle(store.getAll())) ?? []
  keys.forEach((key, index) => {
    const value = values[index]
    if (typeof key === 'string' && value instanceof FileSystemFileHandle) result.set(key, value)
  })
  db.close()
  return result
}

export async function storeHandle(
  documentId: string,
  handle: FileSystemFileHandle | null,
): Promise<void> {
  const db = await openStore()
  if (!db) return
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    if (handle) await settle(store.put(handle, documentId))
    else await settle(store.delete(documentId))
  } catch (error) {
    // A handle that cannot be cloned only means the link is lost on reload.
    console.warn('Could not remember the file handle', error)
  }
  db.close()
}
