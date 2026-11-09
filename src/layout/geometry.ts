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

/** Sticky notes: a caption with the note's name, then its text wrapped to a fixed width. */
export const NOTE = {
  width: 240,
  padY: 10,
  captionHeight: 18,
  lineHeight: 20,
  maxLines: 12,
} as const

export type DetailLevel = 'full' | 'keys' | 'names'

export type TextRole = 'title' | 'name' | 'type' | 'text'

export type MeasureText = (text: string, role: TextRole) => number

export interface TableBox {
  id: string
  width: number
  height: number
  /** Columns that are drawn at the current detail level. */
  rows: ColumnModel[]
  hiddenCount: number
  /** Body text of a note card, already wrapped into lines. */
  lines?: string[]
}

/** Character-count estimate for environments without a canvas. Geist Mono advances 0.6em. */
export const approximateMeasure: MeasureText = (text, role) =>
  text.length * (role === 'title' ? 7.4 : role === 'text' ? 6.6 : 7.2)

export function tableTitle(table: Pick<TableModel, 'name' | 'schema'>): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

/**
 * Columns of each table that take part in at least one relation. The link from a column
 * to its enum type does not count: it is a type, not a key, and the keys view hides it.
 */
export function refColumnsByTable(model: SchemaModel): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const ref of model.refs) {
    if (ref.kind === 'enum') continue
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
  if (table.kind === 'note') return computeNoteBox(table, measure)
  if (table.kind === 'enum') return computeEnumBox(table, detail, measure)
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

/** Enum values are listed like columns, without a type. Zoomed out they fold into a count. */
function computeEnumBox(table: TableModel, detail: DetailLevel, measure: MeasureText): TableBox {
  const rows = detail === 'full' ? table.columns : []
  const hiddenCount = detail === 'keys' ? table.columns.length : 0
  const headerWidth =
    measure(tableTitle(table), 'title') + measure('enum', 'type') + 2 * GEOMETRY.padX + 24
  const rowWidths = rows.map((c) => 2 * GEOMETRY.padX + measure(c.name, 'name'))
  const width = stepWidth(Math.max(headerWidth, ...rowWidths))
  const body =
    detail === 'names'
      ? 0
      : 2 * GEOMETRY.bodyPadY +
        rows.length * GEOMETRY.rowHeight +
        (hiddenCount > 0 ? GEOMETRY.footerHeight : 0)
  return { id: table.id, width, height: GEOMETRY.headerHeight + body, rows, hiddenCount }
}

function computeNoteBox(table: TableModel, measure: MeasureText): TableBox {
  const width = Math.max(NOTE.width, stepWidth(measure(table.name, 'title') + 2 * GEOMETRY.padX))
  const lines = wrapText(table.text ?? '', width - 2 * GEOMETRY.padX, measure, NOTE.maxLines)
  const height =
    2 * NOTE.padY + NOTE.captionHeight + (lines.length > 0 ? 4 + lines.length * NOTE.lineHeight : 0)
  return { id: table.id, width, height, rows: [], hiddenCount: 0, lines }
}

function stepWidth(content: number): number {
  const stepped = Math.ceil(content / GEOMETRY.widthStep) * GEOMETRY.widthStep
  return Math.min(Math.max(stepped, GEOMETRY.minWidth), GEOMETRY.maxWidth)
}

/** Greedy word wrap with measured widths, so canvas and export break the same lines. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureText,
  maxLines: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.replaceAll('\r', '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate, 'text') > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
  }
  while (lines.length > 1 && lines.at(-1) === '') lines.pop()
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s.,;:]*$/, '')}…`
    return kept
  }
  return lines.length === 1 && lines[0] === '' ? [] : lines
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
