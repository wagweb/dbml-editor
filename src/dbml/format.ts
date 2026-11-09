import { applyEdits, diffEdit, type TextEdit } from './edit'
import type { SchemaModel } from './model'
import { parseDbml } from './parse'

/** How one level of indentation is written. */
export interface IndentStyle {
  kind: 'space' | 'tab'
  /** Spaces per level (1 to 8). For tabs it is only the display width. */
  size: number
}

export const DEFAULT_INDENT: IndentStyle = { kind: 'space', size: 2 }

/** The text written once per nesting level: a tab, or that many spaces. */
export function indentUnit(indent: IndentStyle): string {
  if (indent.kind === 'tab') return '\t'
  const size = Number.isFinite(indent.size) ? Math.round(indent.size) : DEFAULT_INDENT.size
  return ' '.repeat(Math.min(8, Math.max(1, size)))
}

/**
 * Edits that format the source; [] when it is already formatted; null when the source
 * does not parse or formatting would change its meaning.
 */
export function formatEdits(
  source: string,
  indent: IndentStyle = DEFAULT_INDENT,
): TextEdit[] | null {
  return format(source, indent)?.edits ?? null
}

/** The formatted text, or null (same conditions as `formatEdits`). */
export function formatDbml(source: string, indent: IndentStyle = DEFAULT_INDENT): string | null {
  return format(source, indent)?.text ?? null
}

/**
 * Guesses the indentation a document already uses, so formatting keeps it. Returns null
 * when nothing is indented or the evidence is unclear.
 */
export function detectIndent(source: string): IndentStyle | null {
  const scanned = scan(source)
  const lines = splitLines(source, scanned.lineModes).filter(
    (line) => line.mode === 'code' && line.text.trim() !== '',
  )
  const leads = lines.map((line) => /^[ \t]*/.exec(line.text)?.[0] ?? '')
  const indented = leads.filter((lead) => lead !== '')
  if (indented.length < MIN_INDENTED_LINES) return null

  const tabs = indented.filter((lead) => lead.startsWith('\t')).length
  if (tabs / indented.length >= CLEAR_MAJORITY) return { kind: 'tab', size: 2 }
  if ((indented.length - tabs) / indented.length < CLEAR_MAJORITY) return null

  const size = commonStep(leads) ?? smallestIndent(indented)
  return size === null ? null : { kind: 'space', size }
}

const MIN_INDENTED_LINES = 2
/** Share of indented lines one style needs before it counts as the document's style. */
const CLEAR_MAJORITY = 0.75
const STEP_SIZES: readonly number[] = [2, 3, 4, 8]

/** The most frequent increase in leading spaces from one line to the next. */
function commonStep(leads: readonly string[]): number | null {
  const counts = new Map<number, number>()
  let previous: number | null = null
  for (const lead of leads) {
    // A tab makes the width unknown, so it neither starts nor ends a step.
    const spaces = lead.includes('\t') ? null : lead.length
    if (spaces !== null && previous !== null && STEP_SIZES.includes(spaces - previous)) {
      counts.set(spaces - previous, (counts.get(spaces - previous) ?? 0) + 1)
    }
    previous = spaces
  }
  let best: number | null = null
  for (const size of STEP_SIZES) {
    if ((counts.get(size) ?? 0) > (best === null ? 0 : (counts.get(best) ?? 0))) best = size
  }
  return best
}

function smallestIndent(indented: readonly string[]): number | null {
  const widths = indented.filter((lead) => !lead.includes('\t')).map((lead) => lead.length)
  const smallest = Math.min(...widths)
  return STEP_SIZES.includes(smallest) ? smallest : null
}

// Scanner. It follows the DBML lexer closely enough to tell code from strings and
// comments, which is all the formatter needs: brackets only count in code.

/** Where the scanner is: in code, or inside one kind of string or comment. */
type Mode = 'code' | 'single' | 'triple' | 'quoted' | 'backtick' | 'lineComment' | 'blockComment'
type InsideMode = Exclude<Mode, 'code'>

const CODE = 0
const STRING = 1
const COMMENT = 2
type CharKind = typeof CODE | typeof STRING | typeof COMMENT

interface Step {
  length: number
  kind: CharKind
  mode: Mode
}

interface Scan {
  /** What each character of the source belongs to. */
  kinds: Uint8Array
  /** The mode at the start of every line. */
  lineModes: Mode[]
  /** The mode at the end of the source. */
  endMode: Mode
}

/** Openers in the order the DBML lexer tries them, so `'''` wins over `'`. */
const OPENERS: ReadonlyArray<readonly [string, InsideMode]> = [
  ["'''", 'triple'],
  ["'", 'single'],
  ['"', 'quoted'],
  ['`', 'backtick'],
  ['//', 'lineComment'],
  ['/*', 'blockComment'],
]

const CLOSERS: Record<InsideMode, string> = {
  single: "'",
  triple: "'''",
  quoted: '"',
  backtick: '`',
  lineComment: '\n',
  blockComment: '*/',
}

/** Backticks and comments are raw in DBML; only these honour backslash escapes. */
const ESCAPING: ReadonlySet<Mode> = new Set(['single', 'triple', 'quoted'])
const ENDS_AT_NEWLINE: ReadonlySet<Mode> = new Set(['single', 'quoted', 'lineComment'])

const kindOf = (mode: InsideMode): CharKind =>
  mode === 'lineComment' || mode === 'blockComment' ? COMMENT : STRING

function scan(source: string): Scan {
  const kinds = new Uint8Array(source.length)
  const lineModes: Mode[] = []
  let mode: Mode = 'code'
  let at = 0
  while (at < source.length) {
    if (at === 0 || source[at - 1] === '\n') lineModes.push(mode)
    const step: Step = mode === 'code' ? codeStep(source, at) : insideStep(source, at, mode)
    kinds.fill(step.kind, at, at + step.length)
    at += step.length
    mode = step.mode
  }
  // The text after a final newline (or an empty text) is one more, empty line.
  if (source.length === 0 || source.endsWith('\n')) lineModes.push(mode)
  return { kinds, lineModes, endMode: mode }
}

function codeStep(source: string, at: number): Step {
  for (const [opener, mode] of OPENERS) {
    if (source.startsWith(opener, at)) return { length: opener.length, kind: kindOf(mode), mode }
  }
  return { length: 1, kind: CODE, mode: 'code' }
}

function insideStep(source: string, at: number, mode: InsideMode): Step {
  const kind = kindOf(mode)
  // An unclosed single line string ends at the newline, as it does in the DBML lexer.
  if (source[at] === '\n' && ENDS_AT_NEWLINE.has(mode))
    return { length: 1, kind: CODE, mode: 'code' }
  if (source[at] === '\\' && ESCAPING.has(mode)) {
    return { length: escapeLength(source, at), kind, mode }
  }
  const closer = CLOSERS[mode]
  if (source.startsWith(closer, at)) return { length: closer.length, kind, mode: 'code' }
  return { length: 1, kind, mode }
}

/** A backslash swallows the next character; before a line break it continues the string. */
function escapeLength(source: string, at: number): number {
  if (source.startsWith('\r\n', at + 1)) return 3
  return at + 1 < source.length ? 2 : 1
}

interface SourceLine {
  from: number
  to: number
  text: string
  /** The mode at the start of the line. */
  mode: Mode
}

function splitLines(source: string, modes: readonly Mode[]): SourceLine[] {
  let from = 0
  return source.split('\n').map((text, index) => {
    const line: SourceLine = { from, to: from + text.length, text, mode: modes[index] ?? 'code' }
    from = line.to + 1
    return line
  })
}

// Shaping: what each line should look like, before blank lines are dropped.

interface Column {
  name: string
  type: string
  settings: string | null
  comment: string | null
}

interface Shaped {
  /** Left exactly as written: the line starts inside a multi-line string or comment. */
  verbatim: boolean
  level: number
  /** The line without its indentation and trailing whitespace. */
  body: string
  blank: boolean
  /** The code on the line ends with `{`. */
  opens: boolean
  /** The line starts with `}`. */
  closes: boolean
  column: Column | null
}

interface Block {
  bracket: string
  /** A `Table` or `TablePartial` body, whose direct lines are columns. */
  table: boolean
}

const OPENING = new Set(['{', '[', '('])
const CLOSING = new Set(['}', ']', ')'])
const isSpace = (char: string | undefined) => char === ' ' || char === '\t' || char === '\r'

const TABLE_HEADER = /^(?:Table|TablePartial)(?![\p{L}\p{M}0-9_])/iu

const IDENT = String.raw`[\p{L}\p{M}0-9_]+`
const QUOTED = String.raw`"(?:[^"\\]|\\.)*"`
const PART = `(?:${QUOTED}|${IDENT})`
// `int[]` is an array type, unlike `int []` (empty settings), so attached brackets stay.
const TYPE = String.raw`${PART}(?:\.${PART})*(?:\([^()'"\x60]*\))?(?:\[\d*\])*`
const COLUMN_LINE = new RegExp(String.raw`^(${PART})\s+(${TYPE})(?:\s+(\[.*\]))?$`, 'u')

function shapeLines(source: string, scanned: Scan, lines: readonly SourceLine[]): Shaped[] {
  const stack: Block[] = []
  let previousCode = ''
  return lines.map((line, index) => {
    const endMode = lines[index + 1]?.mode ?? scanned.endMode
    const shaped =
      line.mode === 'code'
        ? shapeLine(source, scanned.kinds, line, stack, endMode)
        : verbatimLine(line)
    trackBrackets(source, scanned.kinds, line, stack, previousCode)
    const code = codeText(source, scanned.kinds, line.from, line.to)
    if (code !== '') previousCode = code
    return shaped
  })
}

function verbatimLine(line: SourceLine): Shaped {
  return {
    verbatim: true,
    level: 0,
    body: line.text,
    blank: false,
    opens: false,
    closes: false,
    column: null,
  }
}

function shapeLine(
  source: string,
  kinds: Uint8Array,
  line: SourceLine,
  stack: readonly Block[],
  endMode: Mode,
): Shaped {
  let start = line.from
  while (start < line.to && isSpace(source[start])) start += 1
  let end = line.to
  // Trailing whitespace inside a string that runs on is part of its value.
  while (end > start && isSpace(source[end - 1]) && kinds[end - 1] !== STRING) end -= 1
  const body = source.slice(start, end)
  const top = stack.at(-1)
  const inTable = top?.bracket === '{' && top.table
  const endsInCode = endMode === 'code' || endMode === 'lineComment'
  return {
    verbatim: false,
    level: Math.max(0, stack.length - leadingClosers(source, kinds, start, end)),
    body,
    blank: body === '',
    opens: endsWithBrace(source, kinds, start, end),
    closes: body.startsWith('}'),
    column: inTable && endsInCode ? parseColumn(source, kinds, start, end) : null,
  }
}

function leadingClosers(source: string, kinds: Uint8Array, start: number, end: number): number {
  let count = 0
  for (let at = start; at < end; at += 1) {
    const char = source[at]
    if (kinds[at] === CODE && char !== undefined && CLOSING.has(char)) count += 1
    else if (!isSpace(char)) break
  }
  return count
}

function endsWithBrace(source: string, kinds: Uint8Array, start: number, end: number): boolean {
  let at = end - 1
  while (at >= start && (kinds[at] === COMMENT || isSpace(source[at]))) at -= 1
  return at >= start && kinds[at] === CODE && source[at] === '{'
}

/** Splits `name type [settings] // comment`; null for anything else. */
function parseColumn(source: string, kinds: Uint8Array, start: number, end: number): Column | null {
  let codeEnd = end
  let comment: string | null = null
  for (let at = start; at < end; at += 1) {
    if (kinds[at] !== COMMENT) continue
    // A block comment inside the line is unusual enough to leave the line alone.
    if (!source.startsWith('//', at)) return null
    comment = source.slice(at, end)
    codeEnd = at
    break
  }
  const match = COLUMN_LINE.exec(source.slice(start, codeEnd).trimEnd())
  if (!match?.[1] || !match[2]) return null
  return { name: match[1], type: match[2], settings: match[3] ?? null, comment }
}

/** Updates the open brackets with the code on one line. */
function trackBrackets(
  source: string,
  kinds: Uint8Array,
  line: SourceLine,
  stack: Block[],
  previousCode: string,
): void {
  let segment = line.from
  for (let at = line.from; at < line.to; at += 1) {
    const char = source[at]
    if (kinds[at] !== CODE || char === undefined) continue
    if (char === '{') {
      const header = codeText(source, kinds, segment, at)
      // A brace on its own line belongs to the header on the line before.
      const named = header === '' && segment === line.from ? previousCode : header
      stack.push({ bracket: char, table: TABLE_HEADER.test(named) })
      segment = at + 1
    } else if (OPENING.has(char)) {
      stack.push({ bracket: char, table: false })
    } else if (CLOSING.has(char)) {
      stack.pop()
      if (char === '}') segment = at + 1
    }
  }
}

/** The text between two offsets without comments, trimmed. */
function codeText(source: string, kinds: Uint8Array, from: number, to: number): string {
  let text = ''
  for (let at = from; at < to; at += 1) if (kinds[at] !== COMMENT) text += source[at]
  return text.trim()
}

// Column alignment.

const width = (text: string) => [...text].length
const padEnd = (text: string, size: number) => text + ' '.repeat(Math.max(0, size - width(text)))

/** Aligns each run of consecutive column lines; anything else ends a run. */
function alignColumns(lines: readonly Shaped[]): void {
  let run: Array<{ line: Shaped; column: Column }> = []
  for (const line of [...lines, null]) {
    if (line?.column) {
      run.push({ line, column: line.column })
      continue
    }
    if (run.length > 0) alignRun(run)
    run = []
  }
}

function alignRun(run: ReadonlyArray<{ line: Shaped; column: Column }>): void {
  const nameWidth = Math.max(...run.map(({ column }) => width(column.name)))
  // Only lines with settings decide where settings start; a long bare type elsewhere
  // would push them out without lining anything up.
  const typeWidth = Math.max(
    0,
    ...run.filter(({ column }) => column.settings !== null).map(({ column }) => width(column.type)),
  )
  for (const { line, column } of run) {
    const settings = column.settings === null ? '' : ` ${column.settings}`
    const type = column.settings === null ? column.type : padEnd(column.type, typeWidth)
    const comment = column.comment === null ? '' : ` ${column.comment}`
    line.body = `${padEnd(column.name, nameWidth)} ${type}${settings}${comment}`
  }
}

// Blank lines and output.

/** Which lines survive: one blank line at most, none at the edges or next to braces. */
function keptLines(lines: readonly Shaped[]): boolean[] {
  const keep = lines.map((line) => !line.blank)
  let previous: Shaped | null = null
  let firstBlank = -1
  lines.forEach((line, index) => {
    if (line.blank) {
      if (firstBlank === -1) firstBlank = index
      return
    }
    if (firstBlank !== -1 && previous && !previous.opens && !line.closes) keep[firstBlank] = true
    firstBlank = -1
    previous = line
  })
  return keep
}

function renderLine(line: Shaped, unit: string): string {
  if (line.verbatim || line.blank) return line.body
  return unit.repeat(line.level) + line.body
}

/** One edit per changed line, one per stretch of dropped lines, and the final newline. */
function buildEdits(
  source: string,
  lines: readonly SourceLine[],
  texts: readonly string[],
  keep: readonly boolean[],
): TextEdit[] {
  const edits: TextEdit[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    if (keep[index]) {
      const change = diffEdit(line.text, texts[index] ?? line.text)
      if (change)
        edits.push({ ...change, from: change.from + line.from, to: change.to + line.from })
      index += 1
      continue
    }
    let end = index
    while (end < lines.length && !keep[end]) end += 1
    // Dropping lines takes their line breaks along; trailing ones keep the last kept break.
    const to = lines[end]?.from ?? source.length
    if (to > line.from) edits.push({ from: line.from, to, insert: '' })
    index = end
  }
  if (keep.at(-1)) edits.push({ from: source.length, to: source.length, insert: '\n' })
  return edits
}

function withoutRanges(model: SchemaModel): string {
  // Ranges are offsets and move whenever whitespace changes; everything else must not.
  return JSON.stringify(model, (key, value: unknown) => (key === 'range' ? undefined : value))
}

function format(source: string, indent: IndentStyle): { text: string; edits: TextEdit[] } | null {
  const original = parseDbml(source).model
  if (!original) return null

  const scanned = scan(source)
  const lines = splitLines(source, scanned.lineModes)
  const shaped = shapeLines(source, scanned, lines)
  alignColumns(shaped)
  const unit = indentUnit(indent)
  const texts = shaped.map((line) => renderLine(line, unit))
  const keep = keptLines(shaped)
  const edits = buildEdits(source, lines, texts, keep)
  if (edits.length === 0) return { text: source, edits }

  const text = applyEdits(source, edits)
  const formatted = parseDbml(text).model
  if (!formatted || withoutRanges(formatted) !== withoutRanges(original)) return null
  return { text, edits }
}
