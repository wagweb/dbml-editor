import { joinQuery } from '@/dbml/joinQuery'
import { isTable, type SchemaModel } from '@/dbml/model'
import { STARTER_TABLE } from '@/dbml/starter'
import { focusEditor, replaceEditorText, revealInEditor } from '@/editor/bridge'
import { copyText } from '@/export/download'
import { tableRect } from '@/layout/groups'
import { bounds } from '@/layout/router'
import {
  arrange,
  endDrag,
  moveTables,
  selectTable,
  setPathTarget,
  undoArrange,
  useDiagram,
} from '@/store/diagram'
import { useDocuments } from '@/store/documents'
import { resolveTheme, useUi } from '@/store/ui'
import { clickInsets, insetsFor, revealRect } from '@/store/viewport'
import { offerTip } from './tips'

const NUDGE = 16

function tableElement(tableId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-table-id="${CSS.escape(tableId)}"]`)
}

interface FocusOptions {
  /** Keyboard and search callers pass this, so the details are the next thing they reach. */
  focusPanel?: boolean
  /**
   * Pointer clicks on a card: any pan waits a moment, so the second click of a
   * double-click (rename) lands on the table it started on.
   */
  fromPointer?: boolean
  /**
   * May the camera zoom in to make columns readable? Only for jumps from search and from
   * problems; a click within the diagram moves the camera at most sideways.
   */
  zoom?: boolean
}

const DOUBLE_CLICK_MS = 260
let pendingReveal: ReturnType<typeof setTimeout> | undefined

/** Cancels a camera move that a click scheduled, e.g. because a double-click followed. */
export function cancelPendingReveal(): void {
  if (pendingReveal) clearTimeout(pendingReveal)
  pendingReveal = undefined
}

/**
 * Brings a selected table into view, clear of the details panel. Jumps from search and
 * from the keyboard also bring the tables in focus around it when they fit. A pointer
 * click only moves the camera when the clicked table itself would be covered: moving the
 * diagram after a click shifts the next table away from under the pointer.
 */
function revealSelection(tableId: string, options: { zoom: boolean; neighbours: boolean }): void {
  const { model, boxes, positions, emphasis } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  const rect = table && tableRect(table, boxes, positions)
  if (!rect) return
  const around = options.neighbours
    ? bounds(
        [...(emphasis.focus ?? [tableId])].flatMap((id) => {
          const other = tableRect({ id }, boxes, positions)
          return other ? [other] : []
        }),
      )
    : null
  // A clicked table only has to stay clear of the panel and the edges of the canvas.
  const insets = options.neighbours ? insetsFor(true) : clickInsets()
  revealRect(rect, { insets, around: around ?? rect, zoom: options.zoom })
}

/** Selects a table and brings it into view on the canvas and in the editor. */
export function focusTable(tableId: string, options: FocusOptions = {}): void {
  const { model } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  if (!table) return
  selectTable(tableId)
  cancelPendingReveal()
  const zoom = options.zoom ?? false
  if (options.fromPointer) {
    pendingReveal = setTimeout(() => {
      pendingReveal = undefined
      revealSelection(tableId, { zoom, neighbours: false })
    }, DOUBLE_CLICK_MS)
  } else {
    revealSelection(tableId, { zoom, neighbours: true })
  }
  revealInEditor(table.range)
  if (options.focusPanel) {
    // The panel mounts with the selection, one frame later.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-details]')?.focus())
  }
}

/**
 * A click on a card selects it. With Shift held and another table already selected, it
 * asks for the path between the two instead.
 */
export function clickTable(tableId: string, modifiers: { shiftKey: boolean }): void {
  const { model, selectedTableId } = useDiagram.getState()
  const target = model.tables.find((t) => t.id === tableId)
  const selected = model.tables.find((t) => t.id === selectedTableId)
  if (modifiers.shiftKey && target && selected && isTable(target) && isTable(selected)) {
    if (target.id !== selected.id) setPathTarget(tableId)
    return
  }
  focusTable(tableId, { fromPointer: true })
  offerTip()
}

/** Scrolls a table into view without selecting it, e.g. when it receives keyboard focus. */
export function revealTable(tableId: string): void {
  const { model, boxes, positions, selectedTableId } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  const rect = table && tableRect(table, boxes, positions)
  if (rect) revealRect(rect, { insets: insetsFor(selectedTableId !== null) })
}

/**
 * Closes the details panel and hands focus back to the table it described. A path
 * question is taken back first, so one Escape returns to the plain selection.
 */
export function closeDetails(): void {
  const { selectedTableId, pathTargetId } = useDiagram.getState()
  if (selectedTableId === null) return
  if (pathTargetId !== null) {
    setPathTarget(null)
    return
  }
  const active = document.activeElement
  const focusWasInPanel = active === document.body || active?.closest('[data-details]') != null
  selectTable(null)
  if (focusWasInPanel) tableElement(selectedTableId)?.focus()
}

/** Moves a table by one step without dragging: the keyboard and single-click route. */
export function nudgeTable(tableId: string, dx: number, dy: number): void {
  const { positions, boxes, model } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  const rect = table && tableRect(table, boxes, positions)
  if (!rect) return
  moveTables(Object.fromEntries([[tableId, { x: rect.x + dx * NUDGE, y: rect.y + dy * NUDGE }]]))
  endDrag()
  revealTable(tableId)
}

export async function arrangeWithUndo(): Promise<void> {
  const wasManual = !useDiagram.getState().auto
  await arrange()
  // Only a hand-made arrangement is worth restoring.
  if (wasManual) {
    useUi.getState().showToast({
      text: 'Diagram tidied up',
      action: { label: 'Undo', run: undoArrange },
    })
  }
}

export function goToFirstProblem(): void {
  const [first] = useDiagram.getState().diagnostics
  if (!first) return
  useUi.getState().setMobileView('code')
  if (!useUi.getState().editorOpen) useUi.getState().toggleEditor()
  // The editor may have just been mounted by the lines above.
  requestAnimationFrame(() => revealInEditor({ from: first.from, to: first.to }, { focus: true }))
}

export function newDiagram(): void {
  useDocuments.getState().create()
  requestAnimationFrame(focusEditor)
}

/** Puts a small table into an empty diagram as one edit, so undo takes it back. */
export function insertStarterTable(): void {
  if (!replaceEditorText(STARTER_TABLE)) useDocuments.getState().setSource(STARTER_TABLE)
  requestAnimationFrame(focusEditor)
}

export function toggleTheme(): void {
  const { theme, setTheme } = useUi.getState()
  setTheme(resolveTheme(theme) === 'dark' ? 'light' : 'dark')
}

/** Copies a query that joins the tables of a path, one join per relation step. */
export async function copyJoinQuery(model: SchemaModel, path: readonly string[]): Promise<void> {
  const query = joinQuery(model, path)
  const copied = query !== null && (await copyText(query))
  useUi
    .getState()
    .showToast(
      copied
        ? { text: 'Query copied. It joins the tables along the path.' }
        : { text: 'The query could not be copied', tone: 'error' },
    )
}

/** Turns a diagram from a view-only link into one of this browser's own diagrams. */
export function editSharedDiagram(): void {
  const ui = useUi.getState()
  const shared = ui.viewer
  if (!shared) return
  ui.setViewer(null)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  const { documents, create, open } = useDocuments.getState()
  const existing = Object.values(documents).find(
    (doc) => doc.name === shared.name && doc.source === shared.source,
  )
  if (existing) open(existing.id)
  else create({ name: shared.name, source: shared.source })
}
