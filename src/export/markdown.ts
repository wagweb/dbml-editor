import {
  isTable,
  type ColumnModel,
  type EnumModel,
  type IndexModel,
  type RefEndpoint,
  type RefModel,
  type SchemaModel,
  type TableModel,
} from '@/dbml/model'
import { foreignKeysByTable, toMermaid } from './mermaid'

const LINE_BREAK = /\r\n|\r|\n/g
const COLUMN_HEADER = ['Column', 'Type', 'Key', 'Null', 'Default', 'Note']

/** What every table section needs to know about the rest of the schema. */
interface Context {
  tablesById: Map<string, TableModel>
  foreignKeys: Map<string, Set<string>>
  refs: RefModel[]
}

/**
 * A data dictionary for a README or wiki: the Mermaid diagram, every table with its
 * columns, indexes and relations, and the enums. Notes are passed through as Markdown,
 * the way DBML intends them.
 */
export function toMarkdown(model: SchemaModel, title: string): string {
  const tables = model.tables.filter(isTable)
  const tablesById = new Map(tables.map((table) => [table.id, table]))
  const context: Context = {
    tablesById,
    foreignKeys: foreignKeysByTable(model),
    refs: model.refs.filter(
      (ref) =>
        ref.kind !== 'enum' &&
        tablesById.has(ref.child.tableId) &&
        tablesById.has(ref.parent.tableId),
    ),
  }

  const blocks = [`# ${title.replace(LINE_BREAK, ' ')}`, ...noteBlocks(model.project?.note)]
  // A schema of enums only has no diagram to draw and no tables to list.
  if (tables.length > 0) {
    blocks.push('## Diagram', `\`\`\`mermaid\n${toMermaid(model)}\`\`\``)
    blocks.push('## Tables', ...tableSections(model, tables, context))
  }
  if (model.enums.length > 0) blocks.push('## Enums', ...model.enums.flatMap(enumBlocks))
  return `${blocks.join('\n\n')}\n`
}

function tableSections(model: SchemaModel, tables: TableModel[], context: Context): string[] {
  // Suggested groups are the app's guess for the canvas, not part of the documented schema.
  const groups = model.groups
    .filter((group) => !group.suggested)
    .map((group) => ({ group, tables: tables.filter((table) => table.groupId === group.id) }))
    .filter((entry) => entry.tables.length > 0)
  const groupedIds = new Set(groups.flatMap((entry) => entry.tables.map((table) => table.id)))
  const ungrouped = tables.filter((table) => !groupedIds.has(table.id))
  // Without groups, tables sit one level higher, so no heading level is skipped.
  const level = groups.length === 0 ? '###' : '####'
  const describe = (table: TableModel) => tableBlocks(table, context, level)

  if (groups.length === 0) return ungrouped.flatMap(describe)
  const sections = groups.flatMap(({ group, tables: members }) => [
    `### ${group.name}`,
    ...noteBlocks(group.note),
    ...members.flatMap(describe),
  ])
  if (ungrouped.length > 0) sections.push('### Other tables', ...ungrouped.flatMap(describe))
  return sections
}

function tableBlocks(table: TableModel, context: Context, level: string): string[] {
  const foreignKeys = context.foreignKeys.get(table.id) ?? new Set<string>()
  const blocks = [`${level} ${displayName(table)}`, ...noteBlocks(table.note)]
  if (table.columns.length > 0) blocks.push(columnTable(table.columns, foreignKeys))
  if (table.indexes.length > 0) {
    blocks.push('**Indexes**', table.indexes.map(indexLine).join('\n'))
  }
  const relations = relationLines(table, context)
  if (relations.length > 0) blocks.push('**Relations**', relations.join('\n'))
  return blocks
}

function columnTable(columns: ColumnModel[], foreignKeys: Set<string>): string {
  const rows = columns.map((column) => [
    column.name,
    column.type,
    columnKeys(column, foreignKeys.has(column.name)),
    column.notNull || column.pk ? 'no' : 'yes',
    column.defaultValue ?? '',
    column.note ?? '',
  ])
  return [COLUMN_HEADER, COLUMN_HEADER.map(() => '---'), ...rows]
    .map((cells) => `| ${cells.map(cell).join(' | ')} |`)
    .join('\n')
}

function columnKeys(column: ColumnModel, isForeignKey: boolean): string {
  const keys: string[] = []
  if (column.pk) keys.push('PK')
  if (isForeignKey) keys.push('FK')
  if (column.unique) keys.push('unique')
  return keys.join(', ')
}

/** A pipe would end the cell and a line break the whole row. */
function cell(text: string): string {
  return text.trim().replaceAll('|', '\\|').replace(LINE_BREAK, '<br>')
}

function indexLine(index: IndexModel): string {
  const details: string[] = []
  if (index.pk) details.push('pk')
  if (index.unique) details.push('unique')
  if (index.name) details.push(`name: ${index.name}`)
  if (index.type) details.push(`type: ${index.type}`)
  const columns = index.columns.map(code).join(', ')
  return details.length > 0 ? `- ${columns} (${details.join(', ')})` : `- ${columns}`
}

function relationLines(table: TableModel, context: Context): string[] {
  const outgoing = context.refs
    .filter((ref) => ref.child.tableId === table.id)
    .map(
      (ref) =>
        `- ${code(columnList(ref.child.columns))} references ${endpoint(ref.parent, context)}`,
    )
  const incoming = context.refs
    .filter((ref) => ref.parent.tableId === table.id)
    .map(
      (ref) =>
        `- ${code(columnList(ref.parent.columns))} referenced by ${endpoint(ref.child, context)}`,
    )
  return [...outgoing, ...incoming]
}

/** `customers.id`, or `orders.(id, placed_at)` for a composite key, as DBML writes it. */
function endpoint(end: RefEndpoint, context: Context): string {
  const table = context.tablesById.get(end.tableId)
  // Context refs only connect known tables, the id is just a safe stand-in for the type checker.
  const name = table ? displayName(table) : end.tableId
  return code(`${name}.${columnList(end.columns)}`)
}

function columnList(columns: string[]): string {
  const [only, ...rest] = columns
  return only !== undefined && rest.length === 0 ? only : `(${columns.join(', ')})`
}

function enumBlocks(item: EnumModel): string[] {
  const values = item.values.map((value) => {
    const note = value.note?.trim()
    return note ? `- ${code(value.name)}: ${listText(note)}` : `- ${code(value.name)}`
  })
  return [`### ${displayName(item)}`, values.join('\n')]
}

/** Continuation lines are indented so a multi-line note stays inside its list item. */
function listText(text: string): string {
  return text.replace(LINE_BREAK, '\n  ')
}

function noteBlocks(note: string | undefined): string[] {
  const text = note?.trim()
  return text ? [text] : []
}

function displayName(item: { name: string; schema: string | null }): string {
  return item.schema ? `${item.schema}.${item.name}` : item.name
}

function code(text: string): string {
  return `\`${text}\``
}
