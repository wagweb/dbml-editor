import type { ImportDialect } from '@/dbml/sql'
import { useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'

export type TextKind = 'dbml' | 'sql'

/** Tells DBML from SQL by their opening keywords. Null when it is neither. */
export function detectKind(text: string): TextKind | null {
  const code = text.replace(/\/\/.*$/gm, '').replace(/--.*$/gm, '')
  if (
    /^\s*(Table|Enum|Ref|TableGroup|TablePartial|Project|DiagramView|Note)\b[^\n]*[{:]/im.test(code)
  ) {
    return 'dbml'
  }
  if (/\bcreate\s+(table|type|schema)\b/i.test(code)) return 'sql'
  return null
}

/** Picks the dialect whose quoting the statements use; PostgreSQL otherwise. */
export function guessDialect(sql: string): ImportDialect {
  if (/`\w+`/.test(sql) || /\bENGINE\s*=/i.test(sql) || /\bAUTO_INCREMENT\b/i.test(sql)) {
    return 'mysql'
  }
  if (/\[\w+\]/.test(sql) || /\bIDENTITY\s*\(/i.test(sql) || /\bNVARCHAR\b/i.test(sql)) {
    return 'mssql'
  }
  return 'postgres'
}

/** `Project shop { }` names the diagram; a file name is the next best thing. */
export function nameFor(text: string, fallback: string): string {
  const project = /^\s*Project\s+("([^"]+)"|([\w$]+))/m.exec(text)
  const name = project?.[2] ?? project?.[3]
  return name ? name.replaceAll('_', ' ') : fallback
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

/**
 * Opens text that arrived by paste, drop or file picker. DBML becomes a diagram right away;
 * SQL goes through the import dialog so the database can be confirmed. Returns the new
 * diagram's id, or null when it went to the dialog or was not recognised.
 */
export function openText(text: string, options: { fileName?: string } = {}): string | null {
  const fallback = options.fileName ? baseName(options.fileName) : 'Pasted diagram'
  const byExtension = options.fileName?.toLowerCase().endsWith('.sql') ? 'sql' : null
  const kind = byExtension ?? detectKind(text)
  if (kind === 'sql') {
    useUi.getState().openImport({ sql: text, dialect: guessDialect(text), name: fallback })
    return null
  }
  if (kind === null && !options.fileName) {
    useUi.getState().showToast({
      text: 'That does not look like DBML or SQL',
      tone: 'error',
    })
    return null
  }
  return useDocuments.getState().create({ name: nameFor(text, fallback), source: text })
}
