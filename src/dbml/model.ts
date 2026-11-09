/** Half-open character range in the DBML source. */
export interface SourceRange {
  from: number
  to: number
}

export interface ColumnModel {
  name: string
  type: string
  pk: boolean
  /** True when the column is the referencing side of a relation. */
  fk: boolean
  unique: boolean
  notNull: boolean
  increment: boolean
  defaultValue?: string
  note?: string
  enumId?: string
  range: SourceRange
}

export interface IndexModel {
  columns: string[]
  pk: boolean
  unique: boolean
  name?: string
  type?: string
  note?: string
}

export interface TableModel {
  /** `schema.name`, or just `name` in the default schema. */
  id: string
  name: string
  schema: string | null
  alias: string | null
  note?: string
  color?: string
  columns: ColumnModel[]
  indexes: IndexModel[]
  groupId?: string
  range: SourceRange
}

export type Cardinality = 'one' | 'many'

export interface RefEndpoint {
  tableId: string
  columns: string[]
  cardinality: Cardinality
}

export type RefKind = 'many-to-one' | 'one-to-one' | 'many-to-many'

export interface RefModel {
  id: string
  name?: string
  kind: RefKind
  /** Referencing side, the one holding the foreign key. */
  child: RefEndpoint
  /** Referenced side. */
  parent: RefEndpoint
  onDelete?: string
  onUpdate?: string
  color?: string
  range: SourceRange
}

export interface EnumValueModel {
  name: string
  note?: string
}

export interface EnumModel {
  id: string
  name: string
  schema: string | null
  values: EnumValueModel[]
  range: SourceRange
}

export interface GroupModel {
  id: string
  name: string
  tableIds: string[]
  color?: string
  note?: string
  range: SourceRange
}

export interface ProjectModel {
  name?: string
  databaseType?: string
  note?: string
}

export interface SchemaModel {
  project?: ProjectModel
  tables: TableModel[]
  refs: RefModel[]
  enums: EnumModel[]
  groups: GroupModel[]
}

export const EMPTY_MODEL: SchemaModel = { tables: [], refs: [], enums: [], groups: [] }

export const DEFAULT_SCHEMA = 'public'

export function qualifiedId(schema: string | null | undefined, name: string): string {
  // Dots inside a quoted name are escaped, so `"a.b"` never equals table `b` in schema `a`.
  const part = (text: string) => text.replaceAll('\\', '\\\\').replaceAll('.', '\\.')
  return schema && schema !== DEFAULT_SCHEMA ? `${part(schema)}.${part(name)}` : part(name)
}

export function describeRefKind(kind: RefKind): string {
  if (kind === 'one-to-one') return 'one to one'
  if (kind === 'many-to-many') return 'many to many'
  return 'many to one'
}
