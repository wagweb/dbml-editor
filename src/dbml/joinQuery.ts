import { DEFAULT_SCHEMA, type RefModel, type SchemaModel, type TableModel } from './model'

/**
 * Words that cannot stand bare as a table name or an alias in common SQL dialects. Not
 * complete; it covers the names schemas actually use (`user`, `order`, `group`) and the
 * two-letter aliases initials tend to produce (`on`, `as`, `in`).
 */
const RESERVED = new Set([
  'all',
  'and',
  'any',
  'as',
  'asc',
  'at',
  'by',
  'case',
  'check',
  'column',
  'default',
  'desc',
  'do',
  'end',
  'for',
  'from',
  'group',
  'if',
  'in',
  'index',
  'is',
  'join',
  'key',
  'limit',
  'not',
  'of',
  'offset',
  'on',
  'or',
  'order',
  'references',
  'select',
  'set',
  'table',
  'to',
  'top',
  'union',
  'use',
  'user',
  'where',
  'with',
])

function identifier(name: string): string {
  const plain = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toLowerCase())
  return plain ? name : `"${name.replaceAll('"', '""')}"`
}

function tableName(table: TableModel): string {
  const name = identifier(table.name)
  return table.schema && table.schema !== DEFAULT_SCHEMA
    ? `${identifier(table.schema)}.${name}`
    : name
}

/** Initials of the words in a name: `order_items` and `OrderItems` both give `oi`. */
function initials(name: string): string {
  const words = name
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const letters = words.map((word) => word[0]!.toLowerCase()).join('')
  return /^[a-z]/.test(letters) ? letters : `t${letters}`
}

/** Short, unique aliases; a clash first takes more letters of the name, then a number. */
function aliasesFor(tables: readonly TableModel[]): Map<string, string> {
  const taken = new Set<string>()
  const aliases = new Map<string, string>()
  for (const table of tables) {
    const base = initials(table.name)
    const plain = table.name.toLowerCase().replaceAll(/[^a-z0-9_]/g, '')
    const candidates = [base, plain.slice(0, 2), plain.slice(0, 3)].filter(
      (candidate) => /^[a-z]/.test(candidate) && !RESERVED.has(candidate),
    )
    let alias = candidates.find((candidate) => !taken.has(candidate))
    for (let n = 2; alias === undefined; n += 1) {
      if (!taken.has(`${base}${n}`)) alias = `${base}${n}`
    }
    taken.add(alias)
    aliases.set(table.id, alias)
  }
  return aliases
}

function connects(ref: RefModel, a: string, b: string): boolean {
  return (
    ref.kind !== 'enum' &&
    ((ref.child.tableId === a && ref.parent.tableId === b) ||
      (ref.child.tableId === b && ref.parent.tableId === a))
  )
}

/**
 * A query that walks a path of related tables with one join per step, for copying into a
 * query tool. The newly joined table is named first in each condition. When two tables are
 * related more than once, the first relation is used and the others are named in a comment.
 * Returns null when the path has fewer than two tables or leaves the model.
 */
export function joinQuery(model: SchemaModel, path: readonly string[]): string | null {
  if (path.length < 2) return null
  const byId = new Map(model.tables.map((table) => [table.id, table]))
  const tables = path.map((id) => byId.get(id))
  if (tables.some((table) => table === undefined)) return null
  const steps = tables as TableModel[]
  const alias = aliasesFor(steps)
  const column = (tableId: string, name: string) => `${alias.get(tableId)}.${identifier(name)}`

  const lines = ['SELECT *', `FROM ${tableName(steps[0]!)} ${alias.get(steps[0]!.id)}`]
  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1]!
    const current = steps[index]!
    const refs = model.refs.filter((ref) => connects(ref, previous.id, current.id))
    const ref = refs[0]
    if (!ref) return null
    for (const other of refs.slice(1)) {
      const end = other.child
      const owner = end.tableId === current.id ? current : previous
      lines.push(`-- Also related through ${owner.name}.${end.columns.join(', ')}`)
    }
    // The joined table's columns come first: "JOIN customers c ON c.id = o.customer_id".
    const [mine, theirs] =
      ref.child.tableId === current.id ? [ref.child, ref.parent] : [ref.parent, ref.child]
    const conditions = mine.columns.map(
      (name, i) => `${column(mine.tableId, name)} = ${column(theirs.tableId, theirs.columns[i]!)}`,
    )
    lines.push(`JOIN ${tableName(current)} ${alias.get(current.id)} ON ${conditions.join(' AND ')}`)
  }
  return `${lines.join('\n')};\n`
}
