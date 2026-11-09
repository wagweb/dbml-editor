import { DEFAULT_INDENT, formatEdits, type IndentStyle } from '@/dbml/format'
import { applyEditorEdits, editorText, undoEditor } from '@/editor/bridge'
import { activeDocument, useDocuments } from '@/store/documents'
import { isReadOnly, useUi } from '@/store/ui'

/** The indentation a diagram uses: its own, detected or chosen, or the app's default. */
export function indentFor(doc: { indent?: IndentStyle } | undefined): IndentStyle {
  return doc?.indent ?? useUi.getState().indent ?? DEFAULT_INDENT
}

export function describeIndent(indent: IndentStyle): string {
  if (indent.kind === 'tab') return indent.size === 2 ? 'tabs' : `tabs, ${indent.size} wide`
  return `${indent.size} ${indent.size === 1 ? 'space' : 'spaces'}`
}

/** Formats the open diagram's code as one undoable edit. */
export function formatCode(): boolean {
  const ui = useUi.getState()
  const doc = activeDocument()
  const source = editorText() ?? doc?.source
  if (source === undefined || isReadOnly()) return false
  const edits = formatEdits(source, indentFor(doc))
  if (edits === null) {
    ui.showToast({ text: 'Fix the errors in the code first', tone: 'error' })
    return false
  }
  if (edits.length === 0) {
    ui.showToast({ text: 'The code is already formatted' })
    return true
  }
  if (!applyEditorEdits(edits)) return false
  ui.showToast({ text: 'Code formatted', action: { label: 'Undo', run: undoEditor } })
  return true
}

/**
 * Sets the indentation of the open diagram and makes it the default for new ones. The code
 * is not touched until it is formatted; the message offers that.
 */
export function setIndentation(indent: IndentStyle): void {
  const ui = useUi.getState()
  ui.setIndent(indent)
  const doc = activeDocument()
  if (!doc) return
  useDocuments.getState().setIndent(doc.id, indent)
  ui.showToast({
    text: `Indenting with ${describeIndent(indent)}`,
    action: { label: 'Format code', run: () => void formatCode() },
  })
}
