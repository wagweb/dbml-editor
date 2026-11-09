import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import type { SourceRange } from '@/dbml/model'

const FLASH_MS = 900
const MAX_FLASH_LINES = 80

const setFlash = StateEffect.define<SourceRange | null>()
const flashLine = Decoration.line({ class: 'cm-reveal-flash' })

/** Briefly tints the lines that were just revealed from the diagram. */
export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setFlash)) continue
      if (!effect.value) {
        next = Decoration.none
        continue
      }
      const doc = transaction.state.doc
      const first = doc.lineAt(Math.min(effect.value.from, doc.length)).number
      const last = Math.min(
        doc.lineAt(Math.min(effect.value.to, doc.length)).number,
        first + MAX_FLASH_LINES,
      )
      const lines = []
      for (let line = first; line <= last; line += 1)
        lines.push(flashLine.range(doc.line(line).from))
      next = Decoration.set(lines)
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

let view: EditorView | null = null
let flashTimer: ReturnType<typeof setTimeout> | undefined

/** The canvas and menus talk to the editor through this module instead of React props. */
export function registerEditor(next: EditorView | null): void {
  view = next
}

export function revealInEditor(range: SourceRange, options: { focus?: boolean } = {}): void {
  if (!view) return
  const length = view.state.doc.length
  const from = Math.min(range.from, length)
  view.dispatch({
    selection: { anchor: from },
    effects: [
      EditorView.scrollIntoView(from, { y: 'center' }),
      setFlash.of({ from, to: Math.min(range.to, length) }),
    ],
  })
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => view?.dispatch({ effects: setFlash.of(null) }), FLASH_MS)
  if (options.focus) view.focus()
}

/** Replaces the whole text as one undoable edit. */
export function replaceEditorText(text: string): boolean {
  if (!view) return false
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
    scrollIntoView: true,
  })
  return true
}

export function focusEditor(): void {
  view?.focus()
}
