import {
  addColumn,
  addIndex,
  addPrimaryKeyColumn,
  markPrimaryKey,
  renameColumn,
  renameTable,
  setColumnType,
  type TextEdit,
} from './edit'
import type { Hint } from './hints'
import { isTable, type SchemaModel, type TableModel } from './model'

export interface FixDescription {
  /** Button text, short enough for a tooltip or a list row. */
  label: string
  /** Message after the fix was applied. */
  done: string
}

/**
 * The fix a hint offers, without computing it. Cheap enough to run for every hint each time
 * the hints change; the edits themselves are computed with `fixEdits` when asked for.
 */
export function describeFix(hint: Hint, model: SchemaModel): FixDescription | null {
  switch (hint.kind) {
    case 'unindexed-foreign-key':
      return foreignKeyColumns(hint, model) ? { label: 'Add index', done: 'Added an index' } : null
    case 'no-primary-key':
      return idColumn(hint, model)
        ? { label: 'Use id as key', done: 'id is now the primary key' }
        : { label: 'Add id column', done: 'Added an id column as primary key' }
    case 'missing-column':
      // A table whose columns all come from partials has no line to add the column after.
      return hint.suggestion && hasOwnColumn(hint, model)
        ? { label: `Add ${hint.suggestion}`, done: `Added ${hint.suggestion}` }
        : null
    case 'type-mismatch':
      return hint.suggestion && hint.column
        ? { label: `Use ${hint.suggestion}`, done: `Changed the type to ${hint.suggestion}` }
        : null
    case 'naming':
      return hint.suggestion
        ? { label: `Rename to ${hint.suggestion}`, done: `Renamed to ${hint.suggestion}` }
        : null
  }
}

/** The edits that resolve a hint in the given text, or null when that is not possible. */
export function fixEdits(hint: Hint, source: string, model: SchemaModel): TextEdit[] | null {
  switch (hint.kind) {
    case 'unindexed-foreign-key': {
      const columns = foreignKeyColumns(hint, model)
      return columns ? addIndex(source, model, hint.tableId, columns) : null
    }
    case 'no-primary-key': {
      const id = idColumn(hint, model)
      return id
        ? markPrimaryKey(source, model, hint.tableId, id)
        : addPrimaryKeyColumn(source, model, hint.tableId, 'id', primaryKeyType(model))
    }
    case 'missing-column': {
      const table = model.tables.find((t) => t.id === hint.tableId)
      return table && hint.suggestion
        ? addColumn(
            source,
            model,
            table.id,
            hint.suggestion,
            guessColumnType(hint.suggestion, table),
          )
        : null
    }
    case 'type-mismatch':
      return hint.column && hint.suggestion
        ? setColumnType(source, model, hint.tableId, hint.column, hint.suggestion)
        : null
    case 'naming':
      if (!hint.suggestion) return null
      return hint.column
        ? renameColumn(source, model, hint.tableId, hint.column, hint.suggestion)
        : renameTable(source, model, hint.tableId, hint.suggestion)
  }
}

/** All columns of the foreign key the hint points at; the hint itself names only the first. */
function foreignKeyColumns(hint: Hint, model: SchemaModel): string[] | null {
  const ref = model.refs.find(
    (r) => r.child.tableId === hint.tableId && r.child.columns[0] === hint.column,
  )
  return ref ? ref.child.columns : null
}

function hasOwnColumn(hint: Hint, model: SchemaModel): boolean {
  const table = model.tables.find((t) => t.id === hint.tableId)
  return (
    table?.columns.some((c) => c.range.from >= table.range.from && c.range.to <= table.range.to) ??
    false
  )
}

/**
 * A type for a new column, read from common naming patterns. A foreign key gets the type of
 * the table's own key, since a schema tends to use one key type throughout.
 */
export function guessColumnType(name: string, table: TableModel): string {
  if (/(_at|At)$/.test(name)) return 'timestamp'
  if (/^(is|has)(_|[A-Z])/.test(name)) return 'boolean'
  if (/(_id|Id)$/.test(name)) {
    const keys = table.columns.filter((c) => c.pk)
    return keys.length === 1 ? keys[0]!.type : 'int'
  }
  return 'varchar'
}

function idColumn(hint: Hint, model: SchemaModel): string | null {
  const table = model.tables.find((t) => t.id === hint.tableId)
  return table?.columns.find((c) => c.name.toLowerCase() === 'id')?.name ?? null
}

/** The type most single-column primary keys in the schema use, so a new key fits in. */
function primaryKeyType(model: SchemaModel): string {
  const counts = new Map<string, number>()
  for (const table of model.tables.filter(isTable)) {
    const keys = table.columns.filter((c) => c.pk)
    if (keys.length !== 1) continue
    const type = keys[0]!.type
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'int'
}
