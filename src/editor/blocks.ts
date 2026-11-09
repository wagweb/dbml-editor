import { codeFolding, foldGutter, foldService, getIndentUnit } from '@codemirror/language'
import { EditorState, RangeSetBuilder, type Extension, type Text } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * Where the brace that closes the block opened at `open` sits, or -1. Strings, quoted
 * names, expressions and comments are skipped, so braces inside them do not count.
 */
export function matchingBrace(text: string, open: number): number {
  let depth = 0
  let at = open
  while (at < text.length) {
    const char = text[at]!
    if (text.startsWith("'''", at)) {
      const end = text.indexOf("'''", at + 3)
      if (end === -1) return -1
      at = end + 3
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      at = closingQuote(text, at, char)
      if (at === -1) return -1
      continue
    }
    if (text.startsWith('//', at)) {
      const end = text.indexOf('\n', at)
      at = end === -1 ? text.length : end
      continue
    }
    if (text.startsWith('/*', at)) {
      const end = text.indexOf('*/', at + 2)
      if (end === -1) return -1
      at = end + 2
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return at
    }
    at += 1
  }
  return -1
}

/** Position after the quote that closes the one at `start`; backslashes escape. */
function closingQuote(text: string, start: number, quote: string): number {
  for (let at = start + 1; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1
    else if (text[at] === quote) return at + 1
    else if (text[at] === '\n' && quote !== '`') return at
  }
  return -1
}

/** The `{` a line ends with, outside a trailing comment, or -1. */
export function blockOpening(line: string): number {
  const code = line.replace(/\/\/.*$/, '').trimEnd()
  return code.endsWith('{') ? code.length - 1 : -1
}

/** The fold gutter asks once per visible line; the text is built once per version. */
const texts = new WeakMap<Text, string>()
function fullText(doc: Text): string {
  let text = texts.get(doc)
  if (text === undefined) {
    text = doc.toString()
    texts.set(doc, text)
  }
  return text
}

/** A block folds from its opening brace to its closing one: `Table users {…}`. */
const braceFolding = foldService.of((state, lineStart, lineEnd) => {
  const line = state.sliceDoc(lineStart, lineEnd)
  const brace = blockOpening(line)
  if (brace === -1) return null
  const close = matchingBrace(fullText(state.doc), lineStart + brace)
  // Blocks on one line have nothing to hide.
  if (close === -1 || close <= lineEnd) return null
  return { from: lineStart + brace + 1, to: close }
})

function chevron(open: boolean): HTMLElement {
  const marker = document.createElement('span')
  marker.className = 'cm-foldMarker'
  marker.dataset.open = String(open)
  marker.setAttribute('aria-hidden', 'true')
  marker.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>'
  return marker
}

/** Columns of leading whitespace, with tabs counted to the next tab stop. */
export function indentColumns(line: string, tabSize: number): number {
  let columns = 0
  for (const char of line) {
    if (char === ' ') columns += 1
    else if (char === '\t') columns += tabSize - (columns % tabSize)
    else break
  }
  return columns
}

/** The text of a line starts this far in from the line's own left padding. */
const LINE_PADDING = '6px'

/**
 * A hairline per indentation level, and with wrapping a hanging indent: a wrapped line
 * continues one level deeper than it started, so it never runs back to the left edge.
 */
export function lineStyle(columns: number, unit: number, wrap: boolean): string {
  const parts: string[] = []
  if (columns > 0) {
    parts.push(
      `background-image: repeating-linear-gradient(to right, var(--indent-guide) 0 1px, transparent 1px ${unit}ch)`,
      `background-size: ${columns}ch 100%`,
      'background-repeat: no-repeat',
      `background-position: ${LINE_PADDING} 0`,
    )
  }
  if (wrap) {
    const hang = columns + unit
    parts.push(`padding-left: calc(${LINE_PADDING} + ${hang}ch)`, `text-indent: -${hang}ch`)
  }
  return parts.join('; ')
}

function lineDecorations(view: EditorView, wrap: boolean): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tabSize = view.state.facet(EditorState.tabSize)
  const unit = getIndentUnit(view.state)
  const cache = new Map<string, Decoration>()
  for (const { from, to } of view.visibleRanges) {
    for (let at = from; at <= to;) {
      const line = view.state.doc.lineAt(at)
      const style = lineStyle(indentColumns(line.text, tabSize), unit, wrap)
      if (style) {
        let decoration = cache.get(style)
        if (!decoration) {
          decoration = Decoration.line({ attributes: { style } })
          cache.set(style, decoration)
        }
        builder.add(line.from, line.from, decoration)
      }
      at = line.to + 1
    }
  }
  return builder.finish()
}

function indentation(wrap: boolean): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = lineDecorations(view, wrap)
      }
      update(update: ViewUpdate) {
        const reconfigured =
          update.startState.facet(EditorState.tabSize) !==
            update.state.facet(EditorState.tabSize) ||
          getIndentUnit(update.startState) !== getIndentUnit(update.state)
        if (update.docChanged || update.viewportChanged || reconfigured) {
          this.decorations = lineDecorations(update.view, wrap)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}

/** Long lines wrap under their own indentation, or scroll sideways when wrapping is off. */
export function lineLayout(wrap: boolean): Extension {
  return wrap ? [EditorView.lineWrapping, indentation(true)] : indentation(false)
}

export const blockFolding: Extension = [
  braceFolding,
  codeFolding({ placeholderText: '…' }),
  foldGutter({ markerDOM: chevron }),
]
