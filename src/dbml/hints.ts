import { isTable, type SchemaModel, type SourceRange, type TableModel } from './model'

export type HintKind = 'no-primary-key' | 'unindexed-foreign-key' | 'type-mismatch' | 'naming'

/** Something worth a second look. Never an error: the schema is valid DBML. */
export interface Hint {
  kind: HintKind
  message: string
  tableId: string
  column?: string
  range: SourceRange
}

const MAX_NAMING_HINTS = 8

export function schemaHints(model: SchemaModel): Hint[] {
  const tables = model.tables.filter(isTable)
  return [
    ...missingPrimaryKeys(tables),
    ...unindexedForeignKeys(model, tables),
    ...typeMismatches(model, tables),
    ...namingOutliers(tables),
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
        range: from.range,
      })
    })
  }
  return hints
}

type Style = 'snake' | 'camel' | 'pascal'

function styleOf(name: string): Style | null {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake'
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) return 'camel'
  if (/^([A-Z][a-z0-9]+){2,}$/.test(name)) return 'pascal'
  // Single lowercase words fit every style and decide nothing.
  return null
}

const STYLE_NAMES: Record<Style, string> = {
  snake: 'snake_case',
  camel: 'camelCase',
  pascal: 'PascalCase',
}

/** Names written in another style than the clear majority of the schema. */
function namingOutliers(tables: TableModel[]): Hint[] {
  const names = tables.flatMap((table) => [
    { table, name: table.name, range: headRange(table), column: undefined as string | undefined },
    ...table.columns.map((c) => ({ table, name: c.name, range: c.range, column: c.name })),
  ])
  const styled = names.flatMap((entry) => {
    const style = styleOf(entry.name)
    return style ? [{ ...entry, style }] : []
  })
  if (styled.length < 5) return []

  const counts = new Map<Style, number>()
  for (const entry of styled) counts.set(entry.style, (counts.get(entry.style) ?? 0) + 1)
  const [majority, majorityCount] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  if (majorityCount / styled.length < 0.75) return []

  return styled
    .filter((entry) => entry.style !== majority)
    .slice(0, MAX_NAMING_HINTS)
    .map((entry) => ({
      kind: 'naming' as const,
      message: `${entry.column ? `${entry.table.name}.${entry.name}` : entry.name} is ${STYLE_NAMES[entry.style]}, most names here are ${STYLE_NAMES[majority]}`,
      tableId: entry.table.id,
      ...(entry.column ? { column: entry.column } : {}),
      range: entry.range,
    }))
}
