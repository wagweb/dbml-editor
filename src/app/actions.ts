import { isTable } from '@/dbml/model'
import type { Sample } from '@/dbml/samples'
import { focusEditor, replaceEditorText, revealInEditor } from '@/editor/bridge'
import { tableRect } from '@/layout/groups'
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
import { insetsFor, revealRect, visibleFraction } from '@/store/viewport'

const NUDGE = 16

function tableElement(tableId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-table-id="${CSS.escape(tableId)}"]`)
}

interface FocusOptions {
  /** Keyboard and search callers pass this, so the details are the next thing they reach. */
  focusPanel?: boolean
  /**
   * Leave the camera alone while most of the table is on screen. Used for pointer clicks:
   * the user can see the table, and a double-click must not land on a moving target.
   */
  keepCamera?: boolean
}

/** Selects a table and brings it into view on the canvas and in the editor. */
export function focusTable(tableId: string, options: FocusOptions = {}): void {
  const { model, boxes, positions } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  if (!table) return
  selectTable(tableId)
  const rect = tableRect(table, boxes, positions)
  const insets = insetsFor(true)
  if (rect && !(options.keepCamera && visibleFraction(rect, insets) >= 0.5)) {
    revealRect(rect, { insets })
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
  focusTable(tableId, { keepCamera: true })
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

export function openSample(sample: Sample): void {
  useDocuments.getState().create({ name: sample.name, source: sample.source })
}

/** Puts a sample into the current diagram as one edit, so undo brings the old text back. */
export function loadSampleHere(sample: Sample): void {
  if (!replaceEditorText(sample.source)) {
    useDocuments.getState().setSource(sample.source)
  }
}

export function toggleTheme(): void {
  const { theme, setTheme } = useUi.getState()
  setTheme(resolveTheme(theme) === 'dark' ? 'light' : 'dark')
}
