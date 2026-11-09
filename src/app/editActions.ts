import { addGroups, addRelation, renameColumn, renameTable, type TextEdit } from '@/dbml/edit'
import { qualifiedId, type GroupModel, type SchemaModel } from '@/dbml/model'
import { parseDbml } from '@/dbml/parse'
import { applyEditorEdits, editorText, undoEditor } from '@/editor/bridge'
import { tableTitle } from '@/layout/geometry'
import { expectRename, useDiagram } from '@/store/diagram'
import { useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'

export interface ColumnRef {
  tableId: string
  column: string
}

/**
 * Edits made on the canvas are written into the code through the editor, so they sit in
 * its undo history like typed changes. The text is parsed afresh first: the model on
 * screen may lag a few hundred milliseconds behind the text.
 */
function currentSchema(): { source: string; model: SchemaModel } | null {
  const source =
    editorText() ?? useDocuments.getState().documents[useDocuments.getState().activeId]?.source
  if (source === undefined) return null
  const parsed = parseDbml(source)
  if (!parsed.model) {
    useUi.getState().showToast({ text: 'Fix the errors in the code first', tone: 'error' })
    return null
  }
  return { source, model: parsed.model }
}

function commit(edits: TextEdit[] | null, done: string, failed: string): boolean {
  const ui = useUi.getState()
  if (!edits) {
    ui.showToast({ text: failed, tone: 'error' })
    return false
  }
  if (!applyEditorEdits(edits)) return false
  ui.showToast({ text: done, action: { label: 'Undo', run: undoEditor } })
  return true
}

export function renameTableFromDiagram(tableId: string, newName: string): boolean {
  const schema = currentSchema()
  const table = schema?.model.tables.find((t) => t.id === tableId)
  const name = newName.trim()
  if (!schema || !table || name.length === 0 || name === table.name) return false
  const edits = renameTable(schema.source, schema.model, tableId, name)
  if (edits) expectRename(tableId, qualifiedId(table.schema, name))
  return commit(
    edits,
    `Renamed ${table.name} to ${name}`,
    `${name} cannot be used as a table name here`,
  )
}

export function renameColumnFromDiagram(target: ColumnRef, newName: string): boolean {
  const schema = currentSchema()
  const table = schema?.model.tables.find((t) => t.id === target.tableId)
  const name = newName.trim()
  if (!schema || !table || name.length === 0 || name === target.column) return false
  return commit(
    renameColumn(schema.source, schema.model, target.tableId, target.column, name),
    `Renamed ${target.column} to ${name}`,
    `${name} cannot be used as a column name here`,
  )
}

/**
 * Writes `Ref: from > to`. When the first column is a key and the second is not, the
 * relation is turned round: the plain column is the one that references the key.
 */
export function addRelationFromDiagram(from: ColumnRef, to: ColumnRef): boolean {
  const schema = currentSchema()
  if (!schema) return false
  const column = (ref: ColumnRef) =>
    schema.model.tables
      .find((t) => t.id === ref.tableId)
      ?.columns.find((c) => c.name === ref.column)
  const first = column(from)
  const second = column(to)
  if (!first || !second) return false
  const isKey = (c: typeof first) => c.pk || c.unique
  const [child, parent] = isKey(first) && !isKey(second) ? [to, from] : [from, to]
  const label = (ref: ColumnRef) => {
    const table = schema.model.tables.find((t) => t.id === ref.tableId)
    return `${table ? tableTitle(table) : ref.tableId}.${ref.column}`
  }
  return commit(
    addRelation(schema.source, schema.model, child, parent),
    `Added relation ${label(child)} to ${label(parent)}`,
    'This relation cannot be added',
  )
}

/** Turns the suggested groups into TableGroups in the code. */
export function keepSuggestedGroups(): boolean {
  const schema = currentSchema()
  if (!schema) return false
  const groups: GroupModel[] = useDiagram.getState().model.groups.filter((g) => g.suggested)
  if (groups.length === 0) return false
  return commit(
    addGroups(schema.source, schema.model, groups),
    `Added ${groups.length} ${groups.length === 1 ? 'group' : 'groups'} to the code`,
    'The groups could not be written',
  )
}
