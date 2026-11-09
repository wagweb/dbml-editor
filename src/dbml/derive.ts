import { suggestGroups } from './communities'
import type { ColumnModel, RefModel, SchemaModel, TableModel, ViewModel } from './model'

export interface ShowOptions {
  /** Name of the DiagramView to show, or null for everything. */
  view: string | null
  /** Draw enums as cards, linked to the columns that use them. */
  enums: boolean
  /** Detect clusters when the schema defines no TableGroups. */
  suggestGroups: boolean
}

export const enumCardId = (enumId: string) => `enum:${enumId}`
export const noteCardId = (name: string) => `note:${name}`

/**
 * Turns the parsed schema into what the canvas draws: restricted to a view, with suggested
 * groups, and with enums and sticky notes added as cards. The parsed schema stays as it is.
 */
export function shownModel(full: SchemaModel, options: ShowOptions): SchemaModel {
  // A view that no longer exists (renamed or deleted in the code) counts as no view.
  const view = full.views.find((v) => v.name === options.view)
  let model = view ? restrictToView(full, view) : full
  if (options.suggestGroups && model.groups.length === 0) model = withSuggestedGroups(model)
  // A view is a cut of the tables; it only brings the enums those tables use.
  if (options.enums) model = withEnumCards(model, view !== undefined)
  // Notes belong to the whole diagram; a view is a deliberate cut that leaves them out.
  if (!view) model = withNoteCards(model)
  return model
}

function restrictToView(model: SchemaModel, view: ViewModel): SchemaModel {
  const visible = new Set(view.tableIds)
  const groups = model.groups
    .map((group) => ({ ...group, tableIds: group.tableIds.filter((id) => visible.has(id)) }))
    .filter((group) => group.tableIds.length > 0)
  const groupIds = new Set(groups.map((g) => g.id))
  return {
    ...model,
    tables: model.tables
      .filter((t) => visible.has(t.id))
      .map((t) => (t.groupId && !groupIds.has(t.groupId) ? withoutGroup(t) : t)),
    refs: model.refs.filter((r) => visible.has(r.child.tableId) && visible.has(r.parent.tableId)),
    groups,
  }
}

function withoutGroup(table: TableModel): TableModel {
  const { groupId: _groupId, ...rest } = table
  return rest
}

function withSuggestedGroups(model: SchemaModel): SchemaModel {
  const groups = suggestGroups(model)
  if (groups.length === 0) return model
  const groupOf = new Map(groups.flatMap((g) => g.tableIds.map((id) => [id, g.id] as const)))
  return {
    ...model,
    groups,
    tables: model.tables.map((t) => {
      const groupId = groupOf.get(t.id)
      return groupId ? { ...t, groupId } : t
    }),
  }
}

function withEnumCards(model: SchemaModel, usedOnly: boolean): SchemaModel {
  if (model.enums.length === 0) return model
  const used = new Set(model.tables.flatMap((t) => t.columns.flatMap((c) => c.enumId ?? [])))
  const enums = usedOnly ? model.enums.filter((e) => used.has(e.id)) : model.enums
  const cards: TableModel[] = enums.map((item) => ({
    id: enumCardId(item.id),
    kind: 'enum',
    name: item.name,
    schema: item.schema,
    alias: null,
    columns: item.values.map((value): ColumnModel => ({
      name: value.name,
      type: '',
      pk: false,
      fk: false,
      unique: false,
      notNull: false,
      increment: false,
      ...(value.note ? { note: value.note } : {}),
      range: item.range,
    })),
    indexes: [],
    range: item.range,
  }))

  const known = new Set(enums.map((e) => e.id))
  const links: RefModel[] = []
  for (const table of model.tables) {
    for (const column of table.columns) {
      if (!column.enumId || !known.has(column.enumId)) continue
      links.push({
        id: `enum-link:${table.id}.${column.name}`,
        kind: 'enum',
        child: { tableId: table.id, columns: [column.name], cardinality: 'many' },
        parent: { tableId: enumCardId(column.enumId), columns: [], cardinality: 'one' },
        range: column.range,
      })
    }
  }
  return { ...model, tables: [...model.tables, ...cards], refs: [...model.refs, ...links] }
}

function withNoteCards(model: SchemaModel): SchemaModel {
  if (model.notes.length === 0) return model
  const cards: TableModel[] = model.notes.map((note) => ({
    id: noteCardId(note.name),
    kind: 'note',
    name: note.name,
    schema: null,
    alias: null,
    text: note.content,
    ...(note.color ? { color: note.color } : {}),
    columns: [],
    indexes: [],
    range: note.range,
  }))
  return { ...model, tables: [...model.tables, ...cards] }
}
