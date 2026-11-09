import {
  addDoubleQuoteIfNeeded,
  Compiler,
  DEFAULT_ENTRY,
  getMultiplicities,
  MemoryProjectLayout,
  type Column,
  type Database,
  type DiagramView,
  type Index,
  type Ref,
  type Table,
  type TablePartial,
  type TokenPosition,
} from '@dbml/parse'
import {
  qualifiedId,
  type Cardinality,
  type ColumnModel,
  type EnumModel,
  type GroupModel,
  type IndexModel,
  type ProjectModel,
  type RecordsModel,
  type RecordValue,
  type RefEndpoint,
  type RefKind,
  type RefModel,
  type SchemaModel,
  type SourceRange,
  type StickyNoteModel,
  type TableModel,
  type ViewModel,
} from './model'

export interface Diagnostic {
  from: number
  to: number
  message: string
  severity: 'error' | 'warning'
  code?: number
}

export interface ParseResult {
  /** Null while the source has errors. */
  model: SchemaModel | null
  diagnostics: Diagnostic[]
}

export interface DbmlCompletion {
  label: string
  insertText: string
  isSnippet: boolean
  kind: 'keyword' | 'table' | 'column' | 'type' | 'setting' | 'value'
}

const projectLayout = new MemoryProjectLayout()
const compiler = new Compiler(projectLayout)

function setSource(source: string): void {
  if (projectLayout.getSource(DEFAULT_ENTRY) !== source) {
    projectLayout.setSource(DEFAULT_ENTRY, source)
  }
}

export function parseDbml(source: string): ParseResult {
  setSource(source)

  const diagnostics = dedupe([
    ...compiler.parse.errors().map((e) => toDiagnostic(e, 'error', source.length)),
    ...compiler.parse.warnings().map((w) => toDiagnostic(w, 'warning', source.length)),
  ])
  const hasErrors = diagnostics.some((d) => d.severity === 'error')
  const raw = hasErrors ? undefined : compiler.parse.rawDb()

  return { model: raw ? toModel(raw) : null, diagnostics }
}

function toDiagnostic(
  problem: { start: number; end: number; diagnostic: string; code: number },
  severity: Diagnostic['severity'],
  length: number,
): Diagnostic {
  const from = clamp(problem.start, 0, length)
  return {
    from,
    to: clamp(problem.end, from, length),
    message: problem.diagnostic,
    severity,
    code: problem.code,
  }
}

function dedupe(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  return diagnostics
    .filter((d) => {
      const key = `${d.from}:${d.to}:${d.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.from - b.from)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const COMPLETION_KINDS: Record<number, DbmlCompletion['kind']> = {
  3: 'column',
  5: 'table',
  9: 'setting',
  13: 'value',
  15: 'type',
  17: 'keyword',
  24: 'type',
}

const SNIPPET_RULE = 4

/** Context-aware suggestions from the official DBML language service. */
export function completeDbml(source: string, offset: number): DbmlCompletion[] {
  setSource(source)
  const { autocompletionProvider } = compiler.initMonacoServices()
  // The provider only needs a URI and an offset from the Monaco text model.
  const textModel = {
    uri: { toString: () => `file://${DEFAULT_ENTRY.absolute}` },
    getOffsetAt: () => offset,
  }
  try {
    const list = autocompletionProvider.provideCompletionItems(textModel as never, {
      lineNumber: 1,
      column: 1,
    })
    return list.suggestions.map((s) => ({
      label: typeof s.label === 'string' ? s.label : s.label.label,
      insertText: s.insertText,
      isSnippet: ((s.insertTextRules ?? 0) & SNIPPET_RULE) === SNIPPET_RULE,
      kind: COMPLETION_KINDS[s.kind] ?? 'value',
    }))
  } catch {
    // Suggestions are optional; a half-typed document may trip the provider.
    return []
  }
}

/**
 * Renames a table and everything that refers to it (relations, groups, views) with the
 * parser's own refactoring. Returns the new source, or null if the parser declines.
 */
export function renameTableInSource(
  source: string,
  table: { name: string; schema: string | null },
  newName: string,
): string | null {
  setSource(source)
  const schema = table.schema ? { schema: table.schema } : {}
  try {
    const result = compiler.renameTable(
      DEFAULT_ENTRY,
      { table: table.name, ...schema },
      { table: newName, ...schema },
    )
    return [...result.values()][0] ?? null
  } catch {
    return null
  }
}

/** Wraps a name in double quotes when DBML needs them. */
export function quoteName(name: string): string {
  return addDoubleQuoteIfNeeded(name)
}

function toModel(raw: Readonly<Database>): SchemaModel {
  const partials = new Map(raw.tablePartials.map((p) => [p.name, p]))
  const enums = raw.enums.map(toEnum)
  const enumIds = new Set(enums.map((e) => e.id))

  const tables = raw.tables.map((t) => toTable(t, partials, enumIds))
  const tableById = new Map(tables.map((t) => [t.id, t]))

  const refs = uniqueRefIds([
    ...raw.refs.map((r) => toRef(r, raw.tables, tableById)),
    ...raw.tables.flatMap((t) => partialRefs(t, partials, tableById)),
  ]).filter((r) => tableById.has(r.child.tableId) && tableById.has(r.parent.tableId))

  for (const ref of refs) {
    if (ref.kind === 'many-to-many') continue
    const child = tableById.get(ref.child.tableId)
    for (const column of child?.columns ?? []) {
      if (ref.child.columns.includes(column.name)) column.fk = true
    }
  }

  const groups = raw.tableGroups.map((g, index): GroupModel => {
    const name = g.name ?? `Group ${index + 1}`
    return {
      id: `group:${qualifiedId(g.schemaName, name)}`,
      name,
      tableIds: g.tables
        .map((t) => qualifiedId(t.schemaName, t.name))
        .filter((id) => tableById.has(id)),
      ...optional('color', normalizeColor(g.color)),
      ...optional('note', g.note?.value),
      range: toRange(g.token),
    }
  })
  for (const group of groups) {
    for (const id of group.tableIds) {
      const table = tableById.get(id)
      if (table && !table.groupId) table.groupId = group.id
    }
  }

  const notes = raw.notes.map((n): StickyNoteModel => ({
    name: n.name,
    content: n.content,
    ...optional('color', normalizeColor(n.color)),
    range: toRange(n.token),
  }))
  const records = raw.records
    .map((r): RecordsModel => ({
      tableId: qualifiedId(r.schemaName, r.tableName),
      columns: [...r.columns],
      rows: r.values.map((row) => row.map((cell) => toRecordValue(cell.value))),
    }))
    .filter((r) => tableById.has(r.tableId))
  const views = raw.diagramViews.map((view): ViewModel => ({
    name: view.name,
    tableIds: viewTables(view.visibleEntities, tables, groups),
    range: toRange(view.token),
  }))

  const project = toProject(raw.project)
  return { ...(project ? { project } : {}), tables, refs, enums, groups, notes, records, views }
}

function toRecordValue(value: unknown): RecordValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return JSON.stringify(value)
}

/**
 * Tables a DiagramView shows. A view names tables, groups or schemas; whatever is named is
 * shown. A section written with `*` means everything, and a view without any section shows
 * nothing.
 */
function viewTables(
  filter: DiagramView['visibleEntities'],
  tables: TableModel[],
  groups: GroupModel[],
): string[] {
  const named = new Set<string>()
  for (const table of filter.tables ?? []) named.add(qualifiedId(table.schemaName, table.name))
  for (const group of filter.tableGroups ?? []) {
    for (const id of groups.find((g) => g.name === group.name)?.tableIds ?? []) named.add(id)
  }
  for (const schema of filter.schemas ?? []) {
    const wanted = schema.name === 'public' ? null : schema.name
    for (const table of tables) if (table.schema === wanted) named.add(table.id)
  }
  if (named.size > 0) return tables.filter((t) => named.has(t.id)).map((t) => t.id)

  const everything = [filter.tables, filter.tableGroups, filter.schemas].some(
    (section) => section !== null && section.length === 0,
  )
  return everything ? tables.map((t) => t.id) : []
}

function toProject(project: Database['project']): ProjectModel | undefined {
  if (!project || !('token' in project)) return undefined
  const databaseType = (project as Record<string, unknown>).database_type
  return {
    ...optional('name', project.name ?? undefined),
    ...optional('databaseType', typeof databaseType === 'string' ? databaseType : undefined),
    ...optional('note', project.note?.value),
  }
}

function toEnum(raw: Database['enums'][number]): EnumModel {
  return {
    id: qualifiedId(raw.schemaName, raw.name),
    name: raw.name,
    schema: normalizeSchema(raw.schemaName),
    values: raw.values.map((v) => ({ name: v.name, ...optional('note', v.note?.value) })),
    range: toRange(raw.token),
  }
}

function toTable(
  raw: Table,
  partials: Map<string, TablePartial>,
  enumIds: Set<string>,
): TableModel {
  const injected = raw.partials
    .map((p) => partials.get(p.name))
    .filter((p): p is TablePartial => p !== undefined)
  const columns = mergedFields(raw, partials).map((f) => toColumn(f, enumIds))
  const indexes = [...injected.flatMap((p) => p.indexes), ...raw.indexes].map(toIndex)

  for (const index of indexes) {
    if (!index.pk) continue
    for (const column of columns) {
      if (index.columns.includes(column.name)) column.pk = true
    }
  }

  // The last partial that defines a value wins, not simply the last partial.
  const inherited = injected.toReversed()
  const color =
    normalizeColor(raw.headerColor) ??
    inherited.map((p) => normalizeColor(p.headerColor)).find((c) => c !== undefined)
  const note = raw.note?.value ?? inherited.find((p) => p.note)?.note?.value
  return {
    id: qualifiedId(raw.schemaName, raw.name),
    name: raw.name,
    schema: normalizeSchema(raw.schemaName),
    alias: raw.alias,
    ...optional('note', note),
    ...optional('color', color),
    columns,
    indexes,
    range: toRange(raw.token),
  }
}

/** Interleaves partial columns at their injection position; local columns and later partials win. */
function mergedFields(raw: Table, partials: Map<string, TablePartial>): Column[] {
  if (raw.partials.length === 0) return raw.fields

  const injections = [...raw.partials].sort((a, b) => a.order - b.order)
  const localNames = new Set(raw.fields.map((f) => f.name))
  const lastProvider = new Map<string, number>()
  injections.forEach((injection, index) => {
    for (const field of partials.get(injection.name)?.fields ?? []) {
      lastProvider.set(field.name, index)
    }
  })

  const merged: Column[] = []
  let fieldIndex = 0
  let injectionIndex = 0
  const slots = raw.fields.length + injections.length
  for (let slot = 0; slot < slots; slot += 1) {
    const injection = injections[injectionIndex]
    if (injection && (injection.order <= slot || fieldIndex >= raw.fields.length)) {
      for (const field of partials.get(injection.name)?.fields ?? []) {
        const wins = !localNames.has(field.name) && lastProvider.get(field.name) === injectionIndex
        if (wins) merged.push(field)
      }
      injectionIndex += 1
    } else {
      const field = raw.fields[fieldIndex]
      if (field) merged.push(field)
      fieldIndex += 1
    }
  }
  return merged
}

function toColumn(raw: Column, enumIds: Set<string>): ColumnModel {
  const enumId = qualifiedId(raw.type.schemaName, raw.type.type_name)
  return {
    name: raw.name,
    type: raw.type.schemaName ? `${raw.type.schemaName}.${raw.type.type_name}` : raw.type.type_name,
    pk: raw.pk === true,
    fk: false,
    unique: raw.unique === true,
    notNull: raw.not_null === true,
    increment: raw.increment === true,
    ...optional('defaultValue', raw.dbdefault ? String(raw.dbdefault.value) : undefined),
    ...optional('note', raw.note?.value),
    ...optional('enumId', enumIds.has(enumId) ? enumId : undefined),
    range: toRange(raw.token),
  }
}

function toIndex(raw: Index): IndexModel {
  return {
    columns: raw.columns.map((c) => c.value),
    unique: raw.unique === true,
    pk: raw.pk === true,
    ...optional('name', raw.name),
    ...optional('type', raw.type),
    ...optional('note', raw.note?.value),
  }
}

interface RawEndpoint {
  schemaName: string | null
  tableName: string
  fieldNames: string[]
  relation: string
}

function toRef(raw: Ref, rawTables: Table[], tables: Map<string, TableModel>): RefModel {
  const [first, second] = raw.endpoints
  // Inline refs list the referenced column first, standalone refs keep declaration order.
  const inline = rawTables.some(
    (t) =>
      t.token.start.offset <= raw.token.start.offset && raw.token.end.offset <= t.token.end.offset,
  )
  return buildRef(first, second, inline ? 'first' : 'second', tables, {
    range: toRange(raw.token),
    ...optional('name', raw.name ?? undefined),
    ...optional('onDelete', raw.onDelete),
    ...optional('onUpdate', raw.onUpdate),
    ...optional('color', normalizeColor(raw.color)),
  })
}

/** Inline refs written inside a TablePartial apply to every table that injects it. */
function partialRefs(
  raw: Table,
  partials: Map<string, TablePartial>,
  tables: Map<string, TableModel>,
): RefModel[] {
  const table = tables.get(qualifiedId(raw.schemaName, raw.name))
  if (!table) return []
  const present = new Set(table.columns.map((c) => c.name))
  const localNames = new Set(raw.fields.map((f) => f.name))
  // A column defined by several partials comes from the last one, and so does its ref.
  const injections = [...raw.partials].sort((a, b) => a.order - b.order)
  const lastProvider = new Map<string, number>()
  injections.forEach((injection, index) => {
    for (const field of partials.get(injection.name)?.fields ?? []) {
      lastProvider.set(field.name, index)
    }
  })

  return injections.flatMap((injection, index) =>
    (partials.get(injection.name)?.fields ?? [])
      .filter(
        (field) =>
          present.has(field.name) &&
          !localNames.has(field.name) &&
          lastProvider.get(field.name) === index,
      )
      .flatMap((field) =>
        field.inline_refs.flatMap((inlineRef) => {
          const multiplicities = getMultiplicities(inlineRef.relation)
          if (!multiplicities) return []
          const own: RawEndpoint = {
            schemaName: raw.schemaName,
            tableName: raw.name,
            fieldNames: [field.name],
            relation: multiplicities[0],
          }
          const other: RawEndpoint = { ...inlineRef, relation: multiplicities[1] }
          return [buildRef(other, own, 'first', tables, { range: toRange(inlineRef.token) })]
        }),
      ),
  )
}

function buildRef(
  first: RawEndpoint,
  second: RawEndpoint,
  fallbackParent: 'first' | 'second',
  tables: Map<string, TableModel>,
  rest: Omit<RefModel, 'id' | 'kind' | 'child' | 'parent'>,
): RefModel {
  const a = toEndpoint(first)
  const b = toEndpoint(second)

  let kind: RefKind
  let parent: RefEndpoint
  if (a.cardinality === 'many' && b.cardinality === 'many') {
    kind = 'many-to-many'
    parent = b
  } else if (a.cardinality !== b.cardinality) {
    kind = 'many-to-one'
    parent = a.cardinality === 'one' ? a : b
  } else {
    kind = 'one-to-one'
    const aIsKey = isPrimaryKey(a, tables)
    const bIsKey = isPrimaryKey(b, tables)
    if (aIsKey !== bIsKey) parent = aIsKey ? a : b
    else parent = fallbackParent === 'first' ? a : b
  }
  const child = parent === a ? b : a

  return {
    id: `${child.tableId}(${child.columns.join(',')})>${parent.tableId}(${parent.columns.join(',')})`,
    kind,
    child,
    parent,
    ...rest,
  }
}

function toEndpoint(raw: RawEndpoint): RefEndpoint {
  const cardinality: Cardinality = raw.relation.endsWith('*') ? 'many' : 'one'
  return {
    tableId: qualifiedId(raw.schemaName, raw.tableName),
    columns: [...raw.fieldNames],
    cardinality,
  }
}

function isPrimaryKey(endpoint: RefEndpoint, tables: Map<string, TableModel>): boolean {
  const table = tables.get(endpoint.tableId)
  if (!table || endpoint.columns.length === 0) return false
  return endpoint.columns.every((name) => table.columns.find((c) => c.name === name)?.pk === true)
}

function uniqueRefIds(refs: RefModel[]): RefModel[] {
  const counts = new Map<string, number>()
  return refs.map((ref) => {
    const count = (counts.get(ref.id) ?? 0) + 1
    counts.set(ref.id, count)
    return count === 1 ? ref : { ...ref, id: `${ref.id}#${count}` }
  })
}

function toRange(token: TokenPosition): SourceRange {
  return { from: token.start.offset, to: token.end.offset }
}

function normalizeSchema(schema: string | null): string | null {
  return schema && schema !== 'public' ? schema : null
}

function normalizeColor(color: string | undefined): string | undefined {
  return color && color !== 'none' ? color : undefined
}

/** Builds `{ [key]: value }` only when the value is present, so optional fields stay absent. */
function optional<K extends string, V>(key: K, value: V | undefined | null): { [P in K]?: V } {
  return (value === undefined || value === null ? {} : { [key]: value }) as { [P in K]?: V }
}
