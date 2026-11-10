import {
  isTable,
  type GroupModel,
  type SchemaModel,
  type SourceRange,
  type TableModel,
} from './model'
import { parseDbml, quoteName, renameTableInSource } from './parse'

/** Replacement of a stretch of the source; several edits use positions in the old text. */
export interface TextEdit {
  from: number
  to: number
  insert: string
}

export function applyEdits(source: string, edits: readonly TextEdit[]): string {
  let result = source
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to)
  }
  return result
}

/** The smallest single edit that turns one text into the other. */
export function diffEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null
  let start = 0
  const limit = Math.min(before.length, after.length)
  while (start < limit && before[start] === after[start]) start += 1
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1
    endAfter -= 1
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) }
}

function isUsableName(name: string): boolean {
  return name.trim().length > 0 && !/[\n\r"`]/.test(name)
}

/** Only edits that leave the schema valid are handed out. */
function accept(source: string, edits: TextEdit[]): TextEdit[] | null {
  if (edits.length === 0) return null
  return parseDbml(applyEdits(source, edits)).model ? edits : null
}

export function renameTable(
  source: string,
  model: SchemaModel,
  tableId: string,
  newName: string,
): TextEdit[] | null {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  const name = newName.trim()
  if (!table || !isUsableName(name) || name === table.name) return null
  const renamed = renameTableInSource(source, table, name)
  const edit = renamed === null ? null : diffEdit(source, renamed)
  return edit ? accept(source, [edit]) : null
}

/** Length of the identifier that starts at `from`: bare, or wrapped in double quotes. */
function nameTokenLength(source: string, from: number): number {
  if (source[from] === '"') {
    const close = source.indexOf('"', from + 1)
    return close === -1 ? 0 : close - from + 1
  }
  return /^[^\s[\](){},.:]+/.exec(source.slice(from))?.[0].length ?? 0
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Matches a name written bare or in double quotes. */
const spelled = (name: string) => `(?:"${escapeRegExp(name)}"|${escapeRegExp(name)}(?![\\w$]))`

/**
 * Renames a column: its declaration, the relations that mention it, the table's indexes
 * and the column lists of Records. Returns null when the result would not be valid, for
 * example for a column that comes from a TablePartial.
 */
export function renameColumn(
  source: string,
  model: SchemaModel,
  tableId: string,
  column: string,
  newName: string,
): TextEdit[] | null {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  const target = table?.columns.find((c) => c.name === column)
  const name = newName.trim()
  if (!table || !target || !isUsableName(name) || name === column) return null
  if (table.columns.some((c) => c.name === name)) return null
  // Columns injected from a partial are declared elsewhere and shared with other tables.
  if (target.range.from < table.range.from || target.range.to > table.range.to) return null

  const replacement = quoteName(name)
  const edits: TextEdit[] = []
  const declared = nameTokenLength(source, target.range.from)
  if (declared === 0) return null
  edits.push({ from: target.range.from, to: target.range.from + declared, insert: replacement })

  const tableSpellings = [table.name, ...(table.alias ? [table.alias] : [])].map(spelled).join('|')
  const schema = table.schema
    ? `${spelled(table.schema)}\\s*\\.\\s*`
    : `(?:${spelled('public')}\\s*\\.\\s*)?`
  const endpoint = new RegExp(
    `(?<![\\w$".])${schema}(?:${tableSpellings})\\s*\\.\\s*(\\([^)]*\\)|"[^"]*"|[\\w$]+)`,
    'g',
  )
  const one = new RegExp(`^${spelled(column)}$`)
  const inList = new RegExp(`(?<![\\w$"])${spelled(column)}`, 'g')

  for (const ref of model.refs) {
    const touches = [ref.child, ref.parent].some(
      (end) => end.tableId === tableId && end.columns.includes(column),
    )
    if (!touches) continue
    const text = source.slice(ref.range.from, ref.range.to)
    for (const match of text.matchAll(endpoint)) {
      const columns = match[1]!
      const start = ref.range.from + match.index + match[0].length - columns.length
      if (columns.startsWith('(')) {
        for (const inner of columns.matchAll(inList)) {
          edits.push({
            from: start + inner.index,
            to: start + inner.index + inner[0].length,
            insert: replacement,
          })
        }
      } else if (one.test(columns)) {
        edits.push({ from: start, to: start + columns.length, insert: replacement })
      }
    }
  }

  edits.push(...indexEdits(source, table, column, replacement))

  const records = new RegExp(`\\bRecords\\s+${schema}(?:${tableSpellings})\\s*\\(([^)]*)\\)`, 'gi')
  for (const match of source.matchAll(records)) {
    const list = match[1]!
    const start = match.index + match[0].length - 1 - list.length
    for (const inner of list.matchAll(inList)) {
      edits.push({
        from: start + inner.index,
        to: start + inner.index + inner[0].length,
        insert: replacement,
      })
    }
  }

  // The same stretch can be reached twice (a ref that names the column on both ends).
  const unique = [...new Map(edits.map((e) => [`${e.from}:${e.to}`, e])).values()]
  return accept(source, unique)
}

/** Occurrences of a column inside the `indexes { }` block of its table. */
function indexEdits(
  source: string,
  table: TableModel,
  column: string,
  replacement: string,
): TextEdit[] {
  const body = source.slice(table.range.from, table.range.to)
  const open = /\bindexes\s*\{/i.exec(body)
  if (!open) return []
  const start = table.range.from + open.index + open[0].length
  let depth = 1
  let end = start
  while (end < table.range.to && depth > 0) {
    if (source[end] === '{') depth += 1
    if (source[end] === '}') depth -= 1
    end += 1
  }

  const edits: TextEdit[] = []
  let settings = 0
  // Expressions in backticks and strings are left alone, and so are index settings.
  const tokens = /`[^`]*`|'[^']*'|"([^"]*)"|\[|\]|[\w$]+/g
  const block = source.slice(start, end - 1)
  for (const token of block.matchAll(tokens)) {
    if (token[0] === '[') settings += 1
    else if (token[0] === ']') settings = Math.max(0, settings - 1)
    else if (settings === 0 && (token[0] === column || token[1] === column)) {
      const from = start + token.index
      edits.push({ from, to: from + token[0].length, insert: replacement })
    }
  }
  return edits
}

function spellTable(table: TableModel): string {
  return table.schema
    ? `${quoteName(table.schema)}.${quoteName(table.name)}`
    : quoteName(table.name)
}

/** Appends `Ref: from > to`: the first column references the second. */
export function addRelation(
  source: string,
  model: SchemaModel,
  from: { tableId: string; column: string },
  to: { tableId: string; column: string },
): TextEdit[] | null {
  const child = model.tables.find((t) => t.id === from.tableId && isTable(t))
  const parent = model.tables.find((t) => t.id === to.tableId && isTable(t))
  if (!child || !parent) return null
  if (from.tableId === to.tableId && from.column === to.column) return null
  const line = `Ref: ${spellTable(child)}.${quoteName(from.column)} > ${spellTable(parent)}.${quoteName(to.column)}`
  return accept(source, [appendBlock(source, line)])
}

/** Writes suggested groups into the code as real TableGroups. */
export function addGroups(
  source: string,
  model: SchemaModel,
  groups: readonly GroupModel[],
): TextEdit[] | null {
  const byId = new Map(model.tables.map((t) => [t.id, t]))
  const blocks = groups.flatMap((group) => {
    const members = group.tableIds.flatMap((id) => {
      const table = byId.get(id)
      return table ? [`  ${spellTable(table)}`] : []
    })
    if (members.length === 0) return []
    return [`TableGroup ${quoteName(`${group.name}_group`)} {\n${members.join('\n')}\n}`]
  })
  if (blocks.length === 0) return null
  return accept(source, [appendBlock(source, blocks.join('\n\n'))])
}

/**
 * Appends a top-level block after one blank line. `before` is the text that will precede it
 * once the other edits of the same change are applied, which may have removed the old ending.
 */
function appendBlock(source: string, block: string, before = source): TextEdit {
  const gap =
    before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  return { from: source.length, to: source.length, insert: `${gap}${block}\n` }
}

/** The real tables behind the ids, each once and in the given order; unknown ids are dropped. */
function pickTables(model: SchemaModel, tableIds: readonly string[]): TableModel[] {
  const byId = new Map(model.tables.filter(isTable).map((t) => [t.id, t]))
  return [...new Set(tableIds)].flatMap((id) => {
    const table = byId.get(id)
    return table ? [table] : []
  })
}

/**
 * Appends a TableGroup with the given tables. DBML allows a table in one group only, so each
 * table first leaves the written group it is in, and a group that this leaves empty goes away.
 */
export function addGroupFromTables(
  source: string,
  model: SchemaModel,
  name: string,
  tableIds: readonly string[],
): TextEdit[] | null {
  const groupName = name.trim()
  if (!isUsableName(groupName)) return null
  // Suggested groups exist only on the canvas, so their names are free to take.
  const written = model.groups.filter((g) => !g.suggested)
  if (written.some((g) => g.name === groupName)) return null
  const tables = pickTables(model, tableIds)
  if (tables.length === 0) return null

  const edits: TextEdit[] = []
  for (const group of written) {
    const leaving = tables.filter((t) => group.tableIds.includes(t.id))
    if (leaving.length === 0) continue
    if (leaving.length === group.tableIds.length) {
      edits.push(blockRemoval(source, group.range))
      continue
    }
    for (const table of leaving) {
      const edit = memberRemoval(source, group, table)
      if (!edit) return null
      edits.push(edit)
    }
  }

  const members = tables.map((t) => `  ${spellTable(t)}`).join('\n')
  const block = `TableGroup ${quoteName(groupName)} {\n${members}\n}`
  return accept(source, [...edits, appendBlock(source, block, applyEdits(source, edits))])
}

/** Appends a DiagramView that shows exactly the given tables. */
export function addView(
  source: string,
  model: SchemaModel,
  name: string,
  tableIds: readonly string[],
): TextEdit[] | null {
  const viewName = name.trim()
  if (!isUsableName(viewName) || model.views.some((v) => v.name === viewName)) return null
  const tables = pickTables(model, tableIds)
  if (tables.length === 0) return null
  const lines = tables.map((t) => `    ${spellTable(t)}`).join('\n')
  const block = `DiagramView ${quoteName(viewName)} {\n  Tables {\n${lines}\n  }\n}`
  return accept(source, [appendBlock(source, block)])
}

/** The text with comments and strings turned into spaces, so offsets and line breaks stay put. */
function blankOut(text: string): string {
  return text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|'(?:[^'\\\n]|\\.)*'/g, (found) =>
    found.replace(/[^\n]/g, ' '),
  )
}

/** Matches a table reference as a group lists it: by name, schema and name, or alias. */
function tableReference(table: TableModel): RegExp {
  const schema = table.schema
    ? `${spelled(table.schema)}\\s*\\.\\s*`
    : `(?:${spelled('public')}\\s*\\.\\s*)?`
  const alias = table.alias ? `|${spelled(table.alias)}` : ''
  return new RegExp(`^(?:${schema}${spelled(table.name)}${alias})$`)
}

/**
 * Takes a table out of a written TableGroup: its whole line, or only the text between the
 * brace and the line end when it shares a line with the group's opening or closing brace.
 */
function memberRemoval(source: string, group: GroupModel, table: TableModel): TextEdit | null {
  const text = blankOut(source.slice(group.range.from, group.range.to))
  // A quoted group name may hold a brace, so the body starts at the first one outside quotes.
  const head = /^(?:[^{"]|"[^"]*")*\{/.exec(text)
  const close = text.lastIndexOf('}')
  if (!head || close < head[0].length) return null
  const reference = tableReference(table)

  const lines = text.slice(head[0].length, close).split('\n')
  let start = head[0].length
  for (const [i, line] of lines.entries()) {
    const end = start + line.length
    if (reference.test(line.trim())) {
      const ownLine = i > 0 && i < lines.length - 1
      return {
        from: group.range.from + start,
        to: group.range.from + (ownLine ? end + 1 : end),
        insert: '',
      }
    }
    start = end + 1
  }
  return null
}

/** Removes a top-level block with the lines it stands on, and one blank line next to it. */
function blockRemoval(source: string, range: SourceRange): TextEdit {
  const lineStart = source.lastIndexOf('\n', range.from - 1) + 1
  const from = source.slice(lineStart, range.from).trim() === '' ? lineStart : range.from
  const newline = source.indexOf('\n', range.to)
  const lineEnd = newline === -1 ? source.length : newline + 1
  let to = source.slice(range.to, lineEnd).trim() === '' ? lineEnd : range.to
  // Without this the neighbours would end up two blank lines apart.
  if (from === lineStart && (from === 0 || source.slice(0, from).endsWith('\n\n'))) {
    to += /^[ \t]*\n/.exec(source.slice(to))?.[0].length ?? 0
  }
  return { from, to, insert: '' }
}

/**
 * Adds an index on the given columns to a table: into its `indexes` block when it has one,
 * otherwise as a new block at the end of the table.
 */
export function addIndex(
  source: string,
  model: SchemaModel,
  tableId: string,
  columns: string[],
): TextEdit[] | null {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  if (!table || columns.length === 0) return null
  const entry =
    columns.length === 1 ? quoteName(columns[0]!) : `(${columns.map(quoteName).join(', ')})`
  const indent = lineIndent(source, table.columns[0]?.range.from ?? table.range.from) || '  '

  const body = source.slice(table.range.from, table.range.to)
  const open = /\bindexes\s*\{/i.exec(body)
  if (open) {
    const start = table.range.from + open.index + open[0].length
    const close = matchingBrace(source, start, table.range.to)
    if (close === -1) return null
    const lineStart = source.lastIndexOf('\n', close - 1) + 1
    const onOwnLine = source.slice(lineStart, close).trim() === ''
    const at = onOwnLine ? lineStart : close
    const insert = onOwnLine ? `${indent}${indent}${entry}\n` : ` ${entry} `
    return accept(source, [{ from: at, to: at, insert }])
  }

  const close = source.lastIndexOf('}', table.range.to - 1)
  if (close < table.range.from) return null
  const lineStart = source.lastIndexOf('\n', close - 1) + 1
  const onOwnLine = source.slice(lineStart, close).trim() === ''
  const block = `\n${indent}indexes {\n${indent}${indent}${entry}\n${indent}}\n`
  return accept(source, [
    onOwnLine
      ? { from: lineStart, to: lineStart, insert: block.slice(1) }
      : { from: close, to: close, insert: block },
  ])
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? ''
}

/** Position of the `}` that closes the block opened just before `start`, or -1. */
function matchingBrace(source: string, start: number, limit: number): number {
  let depth = 1
  for (let i = start; i < limit; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** The column as written inside its own table, not one injected from a TablePartial. */
function ownColumn(model: SchemaModel, tableId: string, column: string) {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  const target = table?.columns.find((c) => c.name === column)
  if (!table || !target) return null
  if (target.range.from < table.range.from || target.range.to > table.range.to) return null
  return { table, column: target }
}

/** End of the type that starts at `from`: a quoted name, or a word with an optional `(…)`. */
function typeTokenEnd(source: string, from: number, limit: number): number {
  if (source[from] === '"') {
    const close = source.indexOf('"', from + 1)
    return close === -1 || close >= limit ? from : close + 1
  }
  let depth = 0
  let at = from
  for (; at < limit; at += 1) {
    const char = source[at]!
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (/\s/.test(char) || char === '[')) break
  }
  return at
}

/** A type as DBML needs it written: bare when it is one word, quoted otherwise. */
function spellType(type: string): string {
  return /^[\w$.]+(\([^()]*\))?(\[\])?$/.test(type) ? type : `"${type}"`
}

/** Where a column's type is written: after the name, up to the settings. */
function typeSpan(source: string, range: SourceRange): [number, number] | null {
  const nameEnd = range.from + nameTokenLength(source, range.from)
  const start = nameEnd + (/^\s*/.exec(source.slice(nameEnd, range.to))?.[0].length ?? 0)
  const end = typeTokenEnd(source, start, range.to)
  return end > start ? [start, end] : null
}

/** Changes the declared type of a column, e.g. to match the column it references. */
export function setColumnType(
  source: string,
  model: SchemaModel,
  tableId: string,
  column: string,
  type: string,
): TextEdit[] | null {
  const found = ownColumn(model, tableId, column)
  const spelled = type.trim()
  if (!found || !spelled || spelled.includes('"')) return null
  const span = typeSpan(source, found.column.range)
  if (!span) return null
  const [typeStart, typeEnd] = span
  return accept(source, [{ from: typeStart, to: typeEnd, insert: spellType(spelled) }])
}

/** Adds `pk` to a column's settings, or gives it settings with just `pk`. */
export function markPrimaryKey(
  source: string,
  model: SchemaModel,
  tableId: string,
  column: string,
): TextEdit[] | null {
  const found = ownColumn(model, tableId, column)
  if (!found || found.column.pk) return null
  const { range } = found.column
  // Settings start after the type, which may itself hold brackets (`text[]`).
  const span = typeSpan(source, range)
  const open = span ? source.indexOf('[', span[1]) : -1
  const edit =
    open !== -1 && open < range.to
      ? { from: open + 1, to: open + 1, insert: 'pk, ' }
      : { from: range.to, to: range.to, insert: ' [pk]' }
  return accept(source, [edit])
}

/** Inserts a primary key column above the table's first column. */
export function addPrimaryKeyColumn(
  source: string,
  model: SchemaModel,
  tableId: string,
  name: string,
  type: string,
): TextEdit[] | null {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  if (!table || table.columns.some((c) => c.name === name)) return null
  const first = table.columns.find(
    (c) => c.range.from >= table.range.from && c.range.to <= table.range.to,
  )
  if (!first) return null
  const lineStart = source.lastIndexOf('\n', first.range.from - 1) + 1
  const indent = lineIndent(source, first.range.from)
  return accept(source, [
    {
      from: lineStart,
      to: lineStart,
      insert: `${indent}${quoteName(name)} ${spellType(type)} [pk]\n`,
    },
  ])
}

/**
 * Adds a column below the table's last own column, so it lands before any `indexes` or Note
 * block. Columns from a TablePartial are declared elsewhere and give no place to write to.
 */
export function addColumn(
  source: string,
  model: SchemaModel,
  tableId: string,
  name: string,
  type: string,
): TextEdit[] | null {
  const table = model.tables.find((t) => t.id === tableId && isTable(t))
  const column = name.trim()
  const columnType = type.trim()
  if (!table || !isUsableName(column) || !columnType || columnType.includes('"')) return null
  if (table.columns.some((c) => c.name === column)) return null
  const own = table.columns.filter(
    (c) => c.range.from >= table.range.from && c.range.to <= table.range.to,
  )
  const last = own.sort((a, b) => b.range.from - a.range.from)[0]
  if (!last) return null

  // A column that shares the header line has no indentation of its own to copy.
  const lineStart = source.lastIndexOf('\n', last.range.from - 1) + 1
  const indent =
    source.slice(lineStart, last.range.from).trim() === ''
      ? lineIndent(source, last.range.from)
      : `${lineIndent(source, last.range.from)}  `
  const newline = source.indexOf('\n', last.range.to)
  const lineEnd = newline === -1 ? source.length : newline
  const rest = source
    .slice(last.range.to, lineEnd)
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '')
  // A trailing comment stays with its column; a closing brace on the same line moves down.
  const at = rest.trim() === '' ? lineEnd : last.range.to
  return accept(source, [
    { from: at, to: at, insert: `\n${indent}${quoteName(column)} ${spellType(columnType)}` },
  ])
}
