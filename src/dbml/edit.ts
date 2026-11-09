import { isTable, type GroupModel, type SchemaModel, type TableModel } from './model'
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

function appendBlock(source: string, block: string): TextEdit {
  const gap =
    source.length === 0 ? '' : source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n'
  return { from: source.length, to: source.length, insert: `${gap}${block}\n` }
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
