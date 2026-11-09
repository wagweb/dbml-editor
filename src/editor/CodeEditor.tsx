import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  acceptCompletion,
  snippet,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language'
import {
  lintGutter,
  lintKeymap,
  setDiagnostics,
  type Diagnostic as CmDiagnostic,
} from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type ViewUpdate,
} from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { describeIndent, formatCode, indentFor } from '@/app/codeActions'
import { applyHintFix } from '@/app/editActions'
import { describeFix } from '@/dbml/fixes'
import {
  DEFAULT_INDENT,
  detectIndent,
  indentUnit as unitFor,
  type IndentStyle,
} from '@/dbml/format'
import type { Hint } from '@/dbml/hints'
import type { SchemaModel } from '@/dbml/model'
import { completeDbml, type DbmlCompletion, type Diagnostic } from '@/dbml/parse'
import { setCursorOffset, sourceChanged, useDiagram } from '@/store/diagram'
import { activeDocument, useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'
import { blockFolding, lineLayout } from './blocks'
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

/**
 * Templates for the blocks written most. At the top level they replace the bare keyword the
 * language service offers; Tab accepts and then moves from placeholder to placeholder.
 */
const BLOCK_SNIPPETS: Record<string, string> = {
  Table: 'Table ${name} {\n\tid int [pk]\n\t${}\n}',
  Enum: 'Enum ${name} {\n\t${value}\n}',
  Ref: 'Ref: ${table.column} > ${other_table.column}',
  TableGroup: 'TableGroup ${name} {\n\t${table}\n}',
  Note: "Note ${name} {\n\t'${text}'\n}",
}

function withSnippets(items: DbmlCompletion[]): Completion[] {
  // Only the top level offers TableGroup; inside a table, Note means a column note.
  const topLevel = items.some((item) => item.kind === 'keyword' && item.label === 'TableGroup')
  return items.map((item) => {
    const template = topLevel && item.kind === 'keyword' ? BLOCK_SNIPPETS[item.label] : undefined
    return template
      ? snippetCompletion(template, { label: item.label, type: 'keyword', detail: 'block' })
      : toCompletion(item)
  })
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
    options: withSnippets(items),
    validFor: /^[\w$]*$/,
  }
}

function toCmDiagnostics(
  diagnostics: Diagnostic[],
  hints: Hint[],
  model: SchemaModel,
  length: number,
): CmDiagnostic[] {
  const clamp = (range: { from: number; to: number }) => {
    const from = Math.min(range.from, length)
    // Give empty ranges one character so there is something to underline.
    const to = Math.min(Math.max(range.to, from + 1), length)
    return { from: Math.min(from, to), to }
  }
  return [
    ...diagnostics.map((d) => ({ ...clamp(d), severity: d.severity, message: d.message })),
    // Hints are advice, shown quietly; they never count as problems.
    ...hints.map((h): CmDiagnostic => {
      const fix = describeFix(h, model)
      return {
        ...clamp(h.range),
        severity: 'info',
        message: h.message,
        // The fix is computed when it is clicked, on the text as it is then.
        actions: fix ? [{ name: fix.label, apply: () => void applyHintFix(h) }] : undefined,
      }
    }),
  ]
}

/** Indent unit and tab width follow the open diagram; swapped without a new editor state. */
const indentation = new Compartment()
const layout = new Compartment()

function indentExtensions(indent: IndentStyle): Extension[] {
  return [indentUnit.of(unitFor(indent)), EditorState.tabSize.of(indent.size)]
}

/**
 * Code pasted into an empty diagram brings its own indentation; the diagram takes it over,
 * as it does for files that are opened or dropped.
 */
function adoptPastedIndentation(update: ViewUpdate): void {
  const pasted = update.transactions.some((tr) => tr.isUserEvent('input.paste'))
  if (!pasted || update.startState.doc.toString().trim() !== '') return
  const detected = detectIndent(update.state.doc.toString())
  const doc = activeDocument()
  if (!detected || !doc) return
  const current = indentFor(doc)
  if (current.kind === detected.kind && current.size === detected.size) return
  useDocuments.getState().setIndent(doc.id, detected)
  useUi
    .getState()
    .showToast({ text: `Indenting with ${describeIndent(detected)}, like the pasted code` })
}

const extensions: Extension[] = [
  // Problem dots sit left of the numbers, so the fold arrows can sit right at the code.
  lintGutter(),
  lineNumbers(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  history(),
  drawSelection(),
  bracketMatching(),
  closeBrackets(),
  indentOnInput(),
  indentation.of(indentExtensions(DEFAULT_INDENT)),
  layout.of(lineLayout(true)),
  blockFolding,
  dbml(),
  autocompletion({ override: [completions], icons: false }),
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
  // Tab takes the highlighted suggestion, as in most code editors; without one it indents.
  Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
  // Shift + Alt + F, the shortcut VS Code uses. Matched by the physical key: the character
  // differs by platform (an uppercase F on Windows, Ï on a Mac).
  EditorView.domEventHandlers({
    keydown(event) {
      const plain = !event.metaKey && !event.ctrlKey
      if (!(plain && event.altKey && event.shiftKey && event.code === 'KeyF')) return false
      event.preventDefault()
      formatCode()
      return true
    },
  }),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...lintKeymap,
    ...completionKeymap,
    ...foldKeymap,
    indentWithTab,
  ]),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const text = update.state.doc.toString()
      useDocuments.getState().setSource(text)
      sourceChanged(text)
      adoptPastedIndentation(update)
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
      // Only a jump of the cursor moves the camera; typing never does.
      setCursorOffset(update.state.selection.main.head, {
        follow: update.selectionSet && !update.docChanged,
      })
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
  const model = useDiagram((s) => s.fullModel)
  const showHints = useUi((s) => s.showHints)
  const ownIndent = useDocuments((s) => (s.activeId ? s.documents[s.activeId]?.indent : undefined))
  const defaultIndent = useUi((s) => s.indent)
  const indent = ownIndent ?? defaultIndent
  const wrapLines = useUi((s) => s.wrapLines)

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
    viewRef.current?.dispatch({
      effects: [
        indentation.reconfigure(indentExtensions({ kind: indent.kind, size: indent.size })),
        layout.reconfigure(lineLayout(wrapLines)),
      ],
    })
    // A new document gets a new editor state, which starts with the defaults again.
  }, [indent.kind, indent.size, wrapLines, activeId, externalRevision])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const shownHints = showHints && diagnostics.length === 0 ? hints : []
    view.dispatch(
      setDiagnostics(
        view.state,
        toCmDiagnostics(diagnostics, shownHints, model, view.state.doc.length),
      ),
    )
  }, [diagnostics, hints, model, showHints, activeId])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
}
