import { isTable, type SchemaModel, type SourceRange } from '@/dbml/model'

export interface Undocumented {
  tableId: string
  column?: string
  range: SourceRange
}

export interface NoteCoverage {
  notedTables: number
  tables: number
  notedColumns: number
  columns: number
  /** Share of tables and columns with a note, 0 to 100. */
  percent: number
  /** Everything without a note, in the order of the code. */
  missing: Undocumented[]
}

/**
 * How much of the schema is explained by notes. Columns injected from a TablePartial are
 * counted where they are declared, once, not in every table that uses the partial.
 */
export function noteCoverage(model: SchemaModel): NoteCoverage {
  const tables = model.tables.filter(isTable)
  const missing: Undocumented[] = []
  let notedColumns = 0
  let columns = 0
  for (const table of tables) {
    if (!table.note?.trim()) missing.push({ tableId: table.id, range: table.range })
    for (const column of table.columns) {
      const own = column.range.from >= table.range.from && column.range.to <= table.range.to
      if (!own) continue
      columns += 1
      if (column.note?.trim()) notedColumns += 1
      else missing.push({ tableId: table.id, column: column.name, range: column.range })
    }
  }
  const notedTables = tables.filter((t) => t.note?.trim()).length
  const total = tables.length + columns
  return {
    notedTables,
    tables: tables.length,
    notedColumns,
    columns,
    percent: total === 0 ? 100 : Math.floor(((notedTables + notedColumns) / total) * 100),
    missing: missing.sort((a, b) => a.range.from - b.range.from),
  }
}

/** The next place without a note after the given offset, wrapping round to the start. */
export function nextUndocumented(coverage: NoteCoverage, offset: number): Undocumented | null {
  return coverage.missing.find((item) => item.range.from > offset) ?? coverage.missing[0] ?? null
}
