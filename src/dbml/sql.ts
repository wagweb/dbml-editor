export type ExportDialect = 'postgres' | 'mysql' | 'mssql' | 'oracle'
export type ImportDialect = 'postgres' | 'mysql' | 'mssql' | 'snowflake'

export const EXPORT_DIALECTS: { value: ExportDialect; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
]

export const IMPORT_DIALECTS: { value: ImportDialect; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'snowflake', label: 'Snowflake' },
]

// The SQL grammars are several megabytes, so they load only when someone converts.
const loadCore = () => import('@dbml/core')

export async function exportSql(source: string, dialect: ExportDialect): Promise<string> {
  const { exporter } = await loadCore()
  return exporter.export(source, dialect)
}

export async function importSql(sql: string, dialect: ImportDialect): Promise<string> {
  const { importer } = await loadCore()
  return importer.import(sql, dialect)
}

/** The converter reports problems as objects with a `diags` list rather than plain errors. */
export function describeSqlError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'diags' in error) {
    const [first] = (
      error as { diags: { message?: string; location?: { start?: { line?: number } } }[] }
    ).diags
    if (first?.message) {
      const line = first.location?.start?.line
      return line ? `Line ${line}: ${first.message}` : first.message
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'The text could not be converted.'
}
