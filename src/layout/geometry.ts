import type { ColumnModel, SchemaModel, TableModel } from '@/dbml/model'

/** Single source of truth for table card metrics, shared by layout, canvas and export. */
export const GEOMETRY = {
  headerHeight: 38,
  rowHeight: 28,
  bodyPadY: 4,
  padX: 12,
  /** Marker glyph plus gap in front of a column name. */
  iconSlot: 20,
  /** Minimum gap between a column name and its type. */
  columnGap: 24,
  footerHeight: 26,
  minWidth: 176,
  maxWidth: 384,
  widthStep: 16,
  grid: 8,
} as const

export type DetailLevel = 'full' | 'keys' | 'names'

export type TextRole = 'title' | 'name' | 'type'

export type MeasureText = (text: string, role: TextRole) => number

export interface TableBox {
  id: string
  width: number
  height: number
  /** Columns that are drawn at the current detail level. */
  rows: ColumnModel[]
  hiddenCount: number
}

/** Character-count estimate for environments without a canvas. Geist Mono advances 0.6em. */
export const approximateMeasure: MeasureText = (text, role) =>
  text.length * (role === 'title' ? 7.4 : 7.2)

export function tableTitle(table: Pick<TableModel, 'name' | 'schema'>): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

/** Columns of each table that take part in at least one relation. */
export function refColumnsByTable(model: SchemaModel): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const ref of model.refs) {
    for (const endpoint of [ref.child, ref.parent]) {
      const columns = result.get(endpoint.tableId) ?? new Set<string>()
      for (const column of endpoint.columns) columns.add(column)
      result.set(endpoint.tableId, columns)
    }
  }
  return result
}

export function visibleRows(
  table: TableModel,
  detail: DetailLevel,
  refColumns: ReadonlySet<string>,
): ColumnModel[] {
  if (detail === 'names') return []
  if (detail === 'full') return table.columns
  return table.columns.filter((c) => c.pk || c.fk || refColumns.has(c.name))
}

export function computeTableBox(
  table: TableModel,
  detail: DetailLevel,
  measure: MeasureText,
  refColumns: ReadonlySet<string>,
): TableBox {
  const rows = visibleRows(table, detail, refColumns)
  const hiddenCount = detail === 'keys' ? table.columns.length - rows.length : 0

  const headerWidth = measure(tableTitle(table), 'title') + 2 * GEOMETRY.padX + 8
  const rowWidths = rows.map(
    (c) =>
      GEOMETRY.padX +
      GEOMETRY.iconSlot +
      measure(c.name, 'name') +
      GEOMETRY.columnGap +
      measure(c.type, 'type') +
      GEOMETRY.padX,
  )
  const content = Math.max(headerWidth, ...rowWidths)
  const stepped = Math.ceil(content / GEOMETRY.widthStep) * GEOMETRY.widthStep
  const width = Math.min(Math.max(stepped, GEOMETRY.minWidth), GEOMETRY.maxWidth)

  const body =
    detail === 'names'
      ? 0
      : 2 * GEOMETRY.bodyPadY +
        rows.length * GEOMETRY.rowHeight +
        (hiddenCount > 0 ? GEOMETRY.footerHeight : 0)

  return { id: table.id, width, height: GEOMETRY.headerHeight + body, rows, hiddenCount }
}

/** Vertical offset of a column's connection point, measured from the top of its table. */
export function portOffsetY(box: TableBox, column: string | undefined): number {
  const index = column === undefined ? -1 : box.rows.findIndex((r) => r.name === column)
  if (index < 0) return GEOMETRY.headerHeight / 2
  return GEOMETRY.headerHeight + GEOMETRY.bodyPadY + (index + 0.5) * GEOMETRY.rowHeight
}

export function snapToGrid(value: number): number {
  return Math.round(value / GEOMETRY.grid) * GEOMETRY.grid
}
