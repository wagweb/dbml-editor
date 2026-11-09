import {
  isTable,
  type ColumnModel,
  type RefModel,
  type SchemaModel,
  type TableModel,
} from '@/dbml/model'

const INDENT = '  '

/**
 * Words Mermaid's ER lexer turns into keywords before it tries a name, case-insensitively
 * and only when no word character follows. `u` before `-` starts a relation marker.
 */
const MERMAID_KEYWORD =
  /^(?:to|one|many|class|classdef|style|end|subgraph|erdiagram|acctitle|accdescr)(?!\w)|^u-/i
/** Inside an entity block these are read as attribute keys, so a column cannot be called that. */
const ATTRIBUTE_KEY = /^(?:pk|fk|uk)(?!\w)/i
const LINE_BREAK = /\r\n|\r|\n/g

interface Entity {
  table: TableModel
  name: string
}

/** Mermaid `erDiagram` source (no code fence) for the real tables and relations of a schema. */
export function toMermaid(model: SchemaModel): string {
  const entities = toEntities(model.tables)
  const byId = new Map(entities.map((entity) => [entity.table.id, entity]))
  const foreignKeys = foreignKeysByTable(model)

  const lines = ['erDiagram']
  for (const entity of entities) {
    lines.push(...entityLines(entity, foreignKeys.get(entity.table.id)))
  }
  for (const ref of model.refs) {
    const line = relationLine(ref, byId)
    if (line) lines.push(line)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Columns on the child side of a relation, per table id. Many-to-many counts as well, unlike
 * the parser's `fk` flag, because the column still points at another table.
 */
export function foreignKeysByTable(model: SchemaModel): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const ref of model.refs) {
    if (ref.kind === 'enum') continue
    const columns = result.get(ref.child.tableId) ?? new Set<string>()
    for (const column of ref.child.columns) columns.add(column)
    result.set(ref.child.tableId, columns)
  }
  return result
}

function toEntities(cards: TableModel[]): Entity[] {
  const used = new Set<string>()
  return cards.filter(isTable).map((table) => {
    const name = uniqueName(entityName(table), used)
    used.add(name)
    return { table, name }
  })
}

function entityName(table: TableModel): string {
  const qualified = table.schema ? `${table.schema}_${table.name}` : table.name
  return safeWord(qualified.replace(/[^A-Za-z0-9_-]/gu, '_'), MERMAID_KEYWORD)
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base
  let counter = 2
  while (used.has(`${base}_${counter}`)) counter += 1
  return `${base}_${counter}`
}

/** Attribute types and names may also hold parentheses and brackets, as in `varchar(255)`. */
function attributeWord(text: string): string {
  return safeWord(text.replace(/[^A-Za-z0-9_()[\]-]/gu, '_'), ATTRIBUTE_KEY)
}

/** Mermaid words start with a letter or underscore and must not read as a keyword. */
function safeWord(word: string, reserved: RegExp): string {
  return /^[A-Za-z_]/.test(word) && !reserved.test(word) ? word : `_${word}`
}

function entityLines({ table, name }: Entity, foreignKeys: Set<string> | undefined): string[] {
  // `name { }` does not parse in Mermaid, a bare name declares the entity on its own.
  if (table.columns.length === 0) return [`${INDENT}${name}`]
  return [
    `${INDENT}${name} {`,
    ...table.columns.map(
      (column) => `${INDENT}${INDENT}${attribute(column, foreignKeys?.has(column.name) ?? false)}`,
    ),
    `${INDENT}}`,
  ]
}

function attribute(column: ColumnModel, isForeignKey: boolean): string {
  const parts = [attributeWord(column.type), attributeWord(column.name)]
  const keys = attributeKeys(column, isForeignKey)
  if (keys.length > 0) parts.push(keys.join(', '))
  const comment = mermaidText(column.note ?? '')
  if (comment) parts.push(`"${comment}"`)
  return parts.join(' ')
}

function attributeKeys(column: ColumnModel, isForeignKey: boolean): string[] {
  const keys: string[] = []
  if (column.pk) keys.push('PK')
  if (isForeignKey) keys.push('FK')
  if (column.unique) keys.push('UK')
  return keys
}

/** Quoted Mermaid text ends at the next double quote or line break, so neither may appear. */
function mermaidText(text: string): string {
  return text.trim().replaceAll('"', "'").replace(LINE_BREAK, ' ')
}

function relationLine(ref: RefModel, byId: Map<string, Entity>): string | undefined {
  if (ref.kind === 'enum') return undefined
  const parent = byId.get(ref.parent.tableId)
  const child = byId.get(ref.child.tableId)
  if (!parent || !child) return undefined
  const marker = relationMarker(ref, child.table)
  return `${INDENT}${parent.name} ${marker} ${child.name} : ${relationLabel(ref.child.columns)}`
}

/** The child side is always on the right, so the right marker carries its cardinality. */
function relationMarker(ref: RefModel, child: TableModel): string {
  if (ref.kind === 'one-to-one') return '||--o|'
  if (ref.kind === 'many-to-many') return '}o--o{'
  return hasNullableColumn(child, ref.child.columns) ? '|o--o{' : '||--o{'
}

function hasNullableColumn(table: TableModel, names: string[]): boolean {
  return table.columns.some(
    (column) => names.includes(column.name) && !column.notNull && !column.pk,
  )
}

/** A label is one bare word or a quoted string; several columns always need the quotes. */
function relationLabel(columns: string[]): string {
  const [only, ...rest] = columns
  if (only !== undefined && rest.length === 0 && isBareWord(only)) return only
  return `"${mermaidText(columns.join(', '))}"`
}

function isBareWord(text: string): boolean {
  return /^[A-Za-z_]\w*$/.test(text) && !MERMAID_KEYWORD.test(text)
}
