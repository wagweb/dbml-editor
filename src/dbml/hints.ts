import { isTable, type SchemaModel, type SourceRange, type TableModel } from './model'

export type HintKind =
  'no-primary-key' | 'missing-column' | 'unindexed-foreign-key' | 'type-mismatch' | 'naming'

/** Something worth a second look. Never an error: the schema is valid DBML. */
export interface Hint {
  kind: HintKind
  message: string
  tableId: string
  column?: string
  /**
   * What the fix would write: the referenced type, the name in the schema's style, or the
   * name of the missing column.
   */
  suggestion?: string
  range: SourceRange
}

export type NamingStyle = 'snake' | 'camel' | 'pascal'
/** Older name of `NamingStyle`. */
export type Style = NamingStyle

/** What the user wants checked, on top of the checks that always make sense. */
export interface HintRules {
  /** Hint kinds that are switched off. */
  off: readonly HintKind[]
  /** null: the clear majority of the schema decides, as today. Otherwise names must use this style. */
  naming: NamingStyle | null
  /** Column names every table should have, e.g. created_at. Empty: no such hint. */
  requiredColumns: readonly string[]
}

export const DEFAULT_HINT_RULES: HintRules = { off: [], naming: null, requiredColumns: [] }

const MAX_NAMING_HINTS = 8

export function schemaHints(model: SchemaModel, rules: HintRules = DEFAULT_HINT_RULES): Hint[] {
  const tables = model.tables.filter(isTable)
  // Switched off kinds are not computed at all, not just filtered out afterwards.
  const on = (kind: HintKind) => !rules.off.includes(kind)
  return [
    ...(on('no-primary-key') ? missingPrimaryKeys(tables) : []),
    ...(on('missing-column') ? missingColumns(tables, rules.requiredColumns) : []),
    ...(on('unindexed-foreign-key') ? unindexedForeignKeys(model, tables) : []),
    ...(on('type-mismatch') ? typeMismatches(model, tables) : []),
    ...(on('naming') ? namingOutliers(tables, rules.naming) : []),
  ].sort((a, b) => a.range.from - b.range.from)
}

/** Range of the first line of a table, which holds its name. */
function headRange(table: TableModel): SourceRange {
  return {
    from: table.range.from,
    to: Math.min(table.range.to, table.range.from + 6 + table.name.length),
  }
}

function missingPrimaryKeys(tables: TableModel[]): Hint[] {
  return tables
    .filter((t) => t.columns.length > 0 && !t.columns.some((c) => c.pk))
    .map((t) => ({
      kind: 'no-primary-key',
      message: `Table ${t.name} has no primary key`,
      tableId: t.id,
      range: headRange(t),
    }))
}

/**
 * Required columns a table lacks. Columns a TablePartial injects count, since they end up in
 * the table just the same.
 */
function missingColumns(tables: TableModel[], required: readonly string[]): Hint[] {
  const names = [...new Set(required.map((name) => name.trim()).filter(Boolean))]
  if (names.length === 0) return []
  return tables.flatMap((table) => {
    const present = new Set(table.columns.map((c) => c.name))
    return names
      .filter((name) => !present.has(name))
      .map((name) => ({
        kind: 'missing-column' as const,
        message: `Table ${table.name} has no ${name}`,
        tableId: table.id,
        suggestion: name,
        range: headRange(table),
      }))
  })
}

/** A foreign key is covered when an index, the primary key or a unique column starts with it. */
function unindexedForeignKeys(model: SchemaModel, tables: TableModel[]): Hint[] {
  const byId = new Map(tables.map((t) => [t.id, t]))
  const hints: Hint[] = []
  const seen = new Set<string>()
  for (const ref of model.refs) {
    if (ref.kind === 'many-to-many' || ref.kind === 'enum') continue
    const table = byId.get(ref.child.tableId)
    if (!table) continue
    const columns = ref.child.columns
    const key = `${table.id}:${columns.join(',')}`
    if (seen.has(key) || columns.length === 0) continue
    seen.add(key)

    const leads = (candidate: string[]) => columns.every((name, i) => candidate[i] === name)
    const primaryKey = table.columns.filter((c) => c.pk).map((c) => c.name)
    const covered =
      leads(primaryKey) ||
      table.indexes.some((index) => leads(index.columns)) ||
      (columns.length === 1 &&
        table.columns.some((c) => c.name === columns[0] && (c.unique || c.pk)))
    if (covered) continue

    const column = table.columns.find((c) => c.name === columns[0])
    hints.push({
      kind: 'unindexed-foreign-key',
      message: `${table.name}.${columns.join(', ')} is a foreign key without an index`,
      tableId: table.id,
      column: columns[0]!,
      range: column?.range ?? headRange(table),
    })
  }
  return hints
}

const TYPE_FAMILIES: Record<string, string> = {
  int: 'int',
  integer: 'int',
  int4: 'int',
  serial: 'int',
  bigint: 'bigint',
  int8: 'bigint',
  bigserial: 'bigint',
  smallint: 'smallint',
  int2: 'smallint',
  smallserial: 'smallint',
  varchar: 'text',
  nvarchar: 'text',
  'character varying': 'text',
  char: 'text',
  text: 'text',
  bool: 'bool',
  boolean: 'bool',
}

/** Type without length or precision, with common aliases folded together. */
function typeFamily(type: string): string {
  const base = type
    .toLowerCase()
    .replace(/\(.*\)/, '')
    .trim()
  return TYPE_FAMILIES[base] ?? base
}

function typeMismatches(model: SchemaModel, tables: TableModel[]): Hint[] {
  const byId = new Map(tables.map((t) => [t.id, t]))
  const hints: Hint[] = []
  for (const ref of model.refs) {
    if (ref.kind === 'enum') continue
    const child = byId.get(ref.child.tableId)
    const parent = byId.get(ref.parent.tableId)
    if (!child || !parent) continue
    ref.child.columns.forEach((name, i) => {
      const from = child.columns.find((c) => c.name === name)
      const to = parent.columns.find((c) => c.name === ref.parent.columns[i])
      if (!from || !to || typeFamily(from.type) === typeFamily(to.type)) return
      hints.push({
        kind: 'type-mismatch',
        message: `${child.name}.${from.name} is ${from.type}, but ${parent.name}.${to.name} is ${to.type}`,
        tableId: child.id,
        column: from.name,
        suggestion: to.type,
        range: from.range,
      })
    })
  }
  return hints
}

function styleOf(name: string): NamingStyle | null {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake'
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) return 'camel'
  if (/^([A-Z][a-z0-9]+){2,}$/.test(name)) return 'pascal'
  // Single lowercase words fit every style and decide nothing.
  return null
}

const STYLE_NAMES: Record<NamingStyle, string> = {
  snake: 'snake_case',
  camel: 'camelCase',
  pascal: 'PascalCase',
}

/** The same words in another style: `orderItems` becomes `order_items` or `OrderItems`. */
export function inStyle(name: string, style: NamingStyle): string {
  const words = name
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase())
  const capital = (word: string) => word[0]!.toUpperCase() + word.slice(1)
  if (style === 'snake') return words.join('_')
  if (style === 'pascal') return words.map(capital).join('')
  return words.map((word, i) => (i === 0 ? word : capital(word))).join('')
}

/**
 * Names written in another style than the one the schema uses: the style the user chose, or
 * without a choice the clear majority of the schema.
 */
function namingOutliers(tables: TableModel[], chosen: NamingStyle | null): Hint[] {
  const names = tables.flatMap((table) => [
    { table, name: table.name, range: headRange(table), column: undefined as string | undefined },
    ...table.columns.map((c) => ({ table, name: c.name, range: c.range, column: c.name })),
  ])
  const styled = names.flatMap((entry) => {
    const style = styleOf(entry.name)
    return style ? [{ ...entry, style }] : []
  })
  const target = chosen ?? majorityStyle(styled)
  if (!target) return []
  const reason = chosen
    ? `this schema uses ${STYLE_NAMES[target]}`
    : `most names here are ${STYLE_NAMES[target]}`

  return styled
    .filter((entry) => entry.style !== target)
    .slice(0, MAX_NAMING_HINTS)
    .map((entry) => ({
      kind: 'naming' as const,
      message: `${entry.column ? `${entry.table.name}.${entry.name}` : entry.name} is ${STYLE_NAMES[entry.style]}, ${reason}`,
      tableId: entry.table.id,
      ...(entry.column ? { column: entry.column } : {}),
      suggestion: inStyle(entry.name, target),
      range: entry.range,
    }))
}

/** The style at least three quarters of the styled names share, if there are enough of them. */
function majorityStyle(styled: { style: NamingStyle }[]): NamingStyle | null {
  if (styled.length < 5) return null
  const counts = new Map<NamingStyle, number>()
  for (const entry of styled) counts.set(entry.style, (counts.get(entry.style) ?? 0) + 1)
  const [majority, majorityCount] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  return majorityCount / styled.length < 0.75 ? null : majority
}
