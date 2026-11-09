import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippet,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language'
import {
  lintGutter,
  lintKeymap,
  setDiagnostics,
  type Diagnostic as CmDiagnostic,
} from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { Hint } from '@/dbml/hints'
import { completeDbml, type DbmlCompletion, type Diagnostic } from '@/dbml/parse'
import { setCursorOffset, sourceChanged, useDiagram } from '@/store/diagram'
import { activeDocument, useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'
import { flashField, registerEditor } from './bridge'
import { dbml } from './dbmlLanguage'

const COMPLETION_TYPES: Record<DbmlCompletion['kind'], string> = {
  keyword: 'keyword',
  table: 'class',
  column: 'property',
  type: 'type',
  setting: 'keyword',
  value: 'constant',
}

const COMPLETION_DETAILS: Partial<Record<DbmlCompletion['kind'], string>> = {
  table: 'table',
  column: 'column',
  type: 'type',
}

function toCompletion(item: DbmlCompletion): Completion {
  // Monaco writes tab stops as $1, CodeMirror expects ${1}.
  const template = item.insertText.replaceAll(/\$(\d+)/g, '${$1}')
  return {
    label: item.label,
    type: COMPLETION_TYPES[item.kind],
    detail: COMPLETION_DETAILS[item.kind],
    apply: item.isSnippet && template.includes('${') ? snippet(template) : item.insertText,
  }
}

function completions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w$]*/)
  const typed = word ? word.to - word.from : 0
  if (!context.explicit && typed === 0) {
    // Without a typed prefix, only offer suggestions right after a trigger.
    const before = context.state.sliceDoc(Math.max(0, context.pos - 2), context.pos)
    if (!/(\.|\[|[:,<>-] )$/.test(before)) return null
  }
  const items = completeDbml(context.state.doc.toString(), context.pos)
  if (items.length === 0) return null
  return {
    from: word ? word.from : context.pos,
    options: items.map(toCompletion),
    validFor: /^[\w$]*$/,
  }
}

function toCmDiagnostics(diagnostics: Diagnostic[], hints: Hint[], length: number): CmDiagnostic[] {
  const clamp = (range: { from: number; to: number }) => {
    const from = Math.min(range.from, length)
    // Give empty ranges one character so there is something to underline.
    const to = Math.min(Math.max(range.to, from + 1), length)
    return { from: Math.min(from, to), to }
  }
  return [
    ...diagnostics.map((d) => ({ ...clamp(d), severity: d.severity, message: d.message })),
    // Hints are advice, shown quietly; they never count as problems.
    ...hints.map((h) => ({ ...clamp(h.range), severity: 'info' as const, message: h.message })),
  ]
}

const extensions: Extension[] = [
  lineNumbers(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  history(),
  drawSelection(),
  bracketMatching(),
  closeBrackets(),
  indentOnInput(),
  indentUnit.of('  '),
  EditorState.tabSize.of(2),
  dbml(),
  autocompletion({ override: [completions], icons: false }),
  lintGutter(),
  search({ top: true }),
  highlightSelectionMatches(),
  flashField,
  placeholder('Table users {\n  id int [pk]\n}'),
  // The explicit tabindex tells assistive tooling that the scrollable editor is reachable.
  EditorView.contentAttributes.of({
    'aria-label': 'DBML source',
    // Tab indents here, so the way out has to be announced.
    'aria-describedby': 'editor-help',
    spellcheck: 'false',
    // The explicit tabindex tells assistive tooling that the scrollable editor is reachable.
    tabindex: '0',
  }),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...lintKeymap,
    ...completionKeymap,
    indentWithTab,
  ]),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const text = update.state.doc.toString()
      useDocuments.getState().setSource(text)
      sourceChanged(text)
    }
    if (update.focusChanged) {
      // Focus that arrives by Tab is keyboard use; the status bar then shows the way out.
      useUi
        .getState()
        .setEditorKeyboardFocus(
          update.view.hasFocus && document.documentElement.dataset.input === 'keyboard',
        )
    }
    if (update.focusChanged && !update.view.hasFocus) {
      setCursorOffset(null)
    } else if (
      (update.selectionSet || update.focusChanged || update.docChanged) &&
      update.view.hasFocus
    ) {
      setCursorOffset(update.state.selection.main.head)
    }
  }),
]

export function CodeEditor() {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeId = useDocuments((s) => s.activeId)
  const externalRevision = useDocuments((s) => s.externalRevision)
  const diagnostics = useDiagram((s) => s.diagnostics)
  const hints = useDiagram((s) => s.hints)
  const showHints = useUi((s) => s.showHints)

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({ parent: host.current })
    viewRef.current = view
    registerEditor(view)
    return () => {
      registerEditor(null)
      viewRef.current = null
      view.destroy()
    }
  }, [])

  // A fresh state per document keeps undo history from leaking between diagrams.
  useEffect(() => {
    const view = viewRef.current
    const doc = activeDocument()
    if (!view) return
    view.setState(EditorState.create({ doc: doc?.source ?? '', extensions }))
    // A new document starts at its first line, not where the previous one was scrolled to.
    view.scrollDOM.scrollTop = 0
    // Also reloads when another tab saved a newer version of the open diagram.
  }, [activeId, externalRevision])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const shownHints = showHints && diagnostics.length === 0 ? hints : []
    view.dispatch(
      setDiagnostics(view.state, toCmDiagnostics(diagnostics, shownHints, view.state.doc.length)),
    )
  }, [diagnostics, hints, showHints, activeId])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
