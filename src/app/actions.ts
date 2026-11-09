import type { Sample } from '@/dbml/samples'
import { focusEditor, replaceEditorText, revealInEditor } from '@/editor/bridge'
import { tableRect } from '@/layout/groups'
import { arrange, endDrag, moveTables, selectTable, undoArrange, useDiagram } from '@/store/diagram'
import { useDocuments } from '@/store/documents'
import { resolveTheme, useUi } from '@/store/ui'
import { insetsFor, revealRect } from '@/store/viewport'

const NUDGE = 16

function tableElement(tableId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-table-id="${CSS.escape(tableId)}"]`)
}

/**
 * Selects a table and brings it into view on the canvas and in the editor. Keyboard and
 * search callers pass `focusPanel`, so the details are the next thing they reach.
 */
export function focusTable(tableId: string, options: { focusPanel?: boolean } = {}): void {
  const { model, boxes, positions } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  if (!table) return
  selectTable(tableId)
  const rect = tableRect(table, boxes, positions)
  if (rect) revealRect(rect, { insets: insetsFor(true) })
  revealInEditor(table.range)
  if (options.focusPanel) {
    // The panel mounts with the selection, one frame later.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-details]')?.focus())
  }
}

/** Scrolls a table into view without selecting it, e.g. when it receives keyboard focus. */
export function revealTable(tableId: string): void {
  const { model, boxes, positions, selectedTableId } = useDiagram.getState()
  const table = model.tables.find((t) => t.id === tableId)
  const rect = table && tableRect(table, boxes, positions)
  if (rect) revealRect(rect, { insets: insetsFor(selectedTableId !== null) })
}

/** Closes the details panel and hands focus back to the table it described. */
export function closeDetails(): void {
  const { selectedTableId } = useDiagram.getState()
  if (selectedTableId === null) return
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
