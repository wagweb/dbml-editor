import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STARTER_SOURCE } from '@/dbml/starter'
import type { StoredRoute } from '@/layout/elk'
import type { DetailLevel } from '@/layout/geometry'
import type { Point } from '@/layout/router'
import { getOwn } from '@/lib/record'
import { createDebouncedStorage } from '@/lib/storage'
import { useUi } from './ui'

/** Arrangement of one view of the diagram. */
export interface ViewLayout {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  /** Fingerprint of the structure the stored layout belongs to. */
  signature: string | null
  /** False once tables were arranged by hand; new tables are then placed incrementally. */
  auto: boolean
  /** Group pairs the automatic layout stacked; the next layout keeps that decision. */
  stacked?: string[]
}

/** The whole diagram's arrangement plus one per DiagramView, keyed by the view's name. */
export interface DiagramLayout extends ViewLayout {
  detail: DetailLevel
  /** Name of the DiagramView that was open, null for the whole diagram. */
  view?: string | null
  views?: Record<string, ViewLayout>
}

/** A file on disk the document was opened from or saved to. */
export interface FileLink {
  name: string
  /** Fingerprint of the text as it was last read from or written to the file. */
  savedHash: string
}

export interface DiagramDocument {
  id: string
  name: string
  source: string
  createdAt: number
  updatedAt: number
  layout: DiagramLayout
  file?: FileLink
}

interface DocumentsState {
  documents: Record<string, DiagramDocument>
  /** Null until the first diagram is created, and again after the last one is deleted. */
  activeId: string | null
  /** Counts replacements of the open diagram by another browser tab. Not persisted. */
  externalRevision: number

  create: (init?: { name?: string; source?: string }) => string
  open: (id: string) => void
  rename: (id: string, name: string) => void
  duplicate: (id: string) => string | null
  remove: (id: string) => void
  /** Puts a removed document back, e.g. when a deletion is undone. */
  restore: (doc: DiagramDocument) => void
  setSource: (source: string) => void
  /** Replaces the text of any document, e.g. when its file changed on disk. */
  replaceSource: (id: string, source: string) => void
  saveLayout: (layout: Partial<DiagramLayout>) => void
  setFile: (id: string, file: FileLink | null) => void
}

export const EMPTY_VIEW_LAYOUT: ViewLayout = {
  positions: {},
  routes: {},
  signature: null,
  auto: true,
}

export const EMPTY_LAYOUT: DiagramLayout = { ...EMPTY_VIEW_LAYOUT, detail: 'full' }

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function newDocument(name: string, source: string): DiagramDocument {
  const now = Date.now()
  return { id: newId(), name, source, createdAt: now, updatedAt: now, layout: EMPTY_LAYOUT }
}

function uniqueName(base: string, documents: Record<string, DiagramDocument>): string {
  const taken = new Set(Object.values(documents).map((d) => d.name))
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const STORAGE_KEY = 'keyline:documents'

let saveFailureReported = false

/** Tells the user once that nothing is being saved, instead of failing silently. */
function reportSaveFailure(): void {
  if (saveFailureReported) return
  saveFailureReported = true
  useUi.getState().showToast({
    text: 'Changes could not be saved in this browser. Export the diagram to keep it.',
    tone: 'error',
  })
}

export const useDocuments = create<DocumentsState>()(
  persist(
    (set, get) => {
      const patchActive = (patch: (doc: DiagramDocument) => Partial<DiagramDocument>) => {
        const { documents, activeId } = get()
        if (activeId === null) return
        const active = documents[activeId]
        if (!active) return
        set({ documents: { ...documents, [activeId]: { ...active, ...patch(active) } } })
      }

      return {
        documents: {},
        activeId: null,
        externalRevision: 0,

        create: (init) => {
          const { documents } = get()
          const doc = newDocument(
            uniqueName(init?.name?.trim() || 'Untitled diagram', documents),
            init?.source ?? STARTER_SOURCE,
          )
          set({ documents: { ...documents, [doc.id]: doc }, activeId: doc.id })
          return doc.id
        },

        open: (id) => {
          if (get().documents[id]) set({ activeId: id })
        },

        rename: (id, name) => {
          const { documents } = get()
          const doc = documents[id]
          const trimmed = name.trim()
          if (!doc || !trimmed || trimmed === doc.name) return
          set({
            documents: { ...documents, [id]: { ...doc, name: trimmed, updatedAt: Date.now() } },
          })
        },

        duplicate: (id) => {
          const { documents } = get()
          const source = documents[id]
          if (!source) return null
          const copy: DiagramDocument = {
            ...newDocument(uniqueName(`${source.name} copy`, documents), source.source),
            layout: source.layout,
          }
          set({ documents: { ...documents, [copy.id]: copy }, activeId: copy.id })
          return copy.id
        },

        remove: (id) => {
          const { documents, activeId } = get()
          if (!documents[id]) return
          const rest = { ...documents }
          delete rest[id]
          // Without diagrams the app shows its start screen again.
          if (Object.keys(rest).length === 0) {
            set({ documents: rest, activeId: null })
            return
          }
          const next =
            activeId === id
              ? Object.values(rest).sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
              : activeId
          set({ documents: rest, activeId: next })
        },

        restore: (doc) =>
          set({ documents: { ...get().documents, [doc.id]: doc }, activeId: doc.id }),

        setSource: (source) =>
          patchActive((doc) => (doc.source === source ? {} : { source, updatedAt: Date.now() })),

        replaceSource: (id, source) => {
          const { documents } = get()
          const doc = documents[id]
          if (!doc || doc.source === source) return
          set({ documents: { ...documents, [id]: { ...doc, source, updatedAt: Date.now() } } })
        },

        saveLayout: (layout) => patchActive((doc) => ({ layout: { ...doc.layout, ...layout } })),

        setFile: (id, file) => {
          const { documents } = get()
          const doc = documents[id]
          if (!doc) return
          const { file: _previous, ...rest } = doc
          set({ documents: { ...documents, [id]: file ? { ...rest, file } : rest } })
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage:
        createDebouncedStorage<Pick<DocumentsState, 'documents' | 'activeId'>>(reportSaveFailure),
      partialize: (state) => ({ documents: state.documents, activeId: state.activeId }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<DocumentsState> | undefined
        const documents = saved?.documents
        if (!documents || Object.keys(documents).length === 0) return current
        const activeId =
          saved.activeId && documents[saved.activeId]
            ? saved.activeId
            : (sortedDocuments(documents)[0]?.id ?? null)
        return { ...current, documents, activeId }
      },
    },
  ),
)

export function sortedDocuments(documents: Record<string, DiagramDocument>): DiagramDocument[] {
  return Object.values(documents).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The open diagram, or undefined on the start screen. */
export function activeDocument(): DiagramDocument | undefined {
  const { documents, activeId } = useDocuments.getState()
  return activeId === null ? undefined : documents[activeId]
}

/**
 * Every tab writes the whole document list, so without this the last writer would win and
 * a diagram created in another tab (for example from a share link) could be lost. Newer
 * and unknown documents from the other tab are taken over. Deletions are not propagated.
 */
function mergeFromOtherTab(raw: string): void {
  let incoming: unknown
  try {
    incoming = (JSON.parse(raw) as { state?: { documents?: unknown } }).state?.documents
  } catch {
    return
  }
  if (typeof incoming !== 'object' || incoming === null) return

  const { documents, activeId, externalRevision } = useDocuments.getState()
  const merged = { ...documents }
  const hadNone = activeId === null
  let changed = false
  let activeReplaced = false
  for (const [id, doc] of Object.entries(incoming as Record<string, DiagramDocument>)) {
    if (typeof doc?.source !== 'string' || typeof doc.updatedAt !== 'number') continue
    const local = getOwn(documents, id)
    if (local && local.updatedAt >= doc.updatedAt) continue
    merged[id] = doc
    changed = true
    if (id === activeId) activeReplaced = true
  }
  if (!changed) return
  useDocuments.setState({
    documents: merged,
    // A diagram created in another tab ends the start screen here as well.
    activeId: hadNone ? (sortedDocuments(merged)[0]?.id ?? null) : activeId,
    externalRevision: activeReplaced ? externalRevision + 1 : externalRevision,
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) mergeFromOtherTab(event.newValue)
  })
}
