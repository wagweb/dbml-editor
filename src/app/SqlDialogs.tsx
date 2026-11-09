import { Check, Copy, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  describeSqlError,
  EXPORT_DIALECTS,
  exportSql,
  IMPORT_DIALECTS,
  importSql,
  type ExportDialect,
  type ImportDialect,
} from '@/dbml/sql'
import { copyText, downloadText, fileSlug } from '@/export/download'
import { shownDiagram, useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Segmented } from '@/ui/Segmented'

type Conversion =
  { status: 'working' } | { status: 'done'; sql: string } | { status: 'failed'; message: string }

export function SqlExportDialog() {
  const open = useUi((s) => s.dialog === 'export-sql')
  const openDialog = useUi((s) => s.openDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'export-sql' : null)}
      title="Export as SQL"
      description="Create statements for the tables, keys and relations of this diagram."
    >
      {open && <SqlExport />}
    </Dialog>
  )
}

function SqlExport() {
  const [dialect, setDialect] = useState<ExportDialect>('postgres')
  const [result, setResult] = useState<Conversion & { dialect?: ExportDialect }>({
    status: 'working',
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    exportSql(shownDiagram()?.source ?? '', dialect)
      .then((sql) => !cancelled && setResult({ status: 'done', sql, dialect }))
      .catch(
        (error: unknown) =>
          !cancelled && setResult({ status: 'failed', message: describeSqlError(error), dialect }),
      )
    return () => {
      cancelled = true
    }
  }, [dialect])

  // While another dialect is loading, the previous result is out of date.
  const current: Conversion = result.dialect === dialect ? result : { status: 'working' }
  const sql = current.status === 'done' ? current.sql : null

  const copy = async () => {
    if (sql === null || !(await copyText(sql))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const download = () => {
    if (sql !== null) downloadText(`${fileSlug(shownDiagram()?.name ?? 'diagram')}.sql`, sql)
  }

  return (
    <>
      <div className="px-5 pb-3">
        <Segmented
          label="Database"
          // Four database names do not fit side by side on a phone.
          className="w-full max-sm:grid-flow-row max-sm:grid-cols-2"
          value={dialect}
          options={EXPORT_DIALECTS}
          onChange={setDialect}
        />
      </div>
      <div className="mx-5 min-h-40 flex-1 overflow-auto rounded-lg border border-line bg-panel">
        {current.status === 'working' && (
          <p role="status" className="p-4 text-[13px] text-ink-2">
            Preparing the script…
          </p>
        )}
        {current.status === 'failed' && (
          <p role="alert" className="p-4 text-[13px] text-danger">
            {current.message}
          </p>
        )}
        {sql !== null && (
          <pre
            tabIndex={0}
            aria-label="SQL script"
            className="p-4 font-mono text-xs leading-[1.7] whitespace-pre text-ink"
          >
            {sql.trim() || '-- This diagram has no tables yet.'}
          </pre>
        )}
      </div>
      <footer className="flex justify-end gap-2 px-5 py-4">
        <Button disabled={sql === null} onClick={() => void copy()}>
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          <span role="status">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
        <Button variant="primary" disabled={sql === null} onClick={download}>
          <Download aria-hidden className="size-4" />
          Download .sql
        </Button>
      </footer>
    </>
  )
}

export function SqlImportDialog() {
  const open = useUi((s) => s.dialog === 'import-sql')
  const openDialog = useUi((s) => s.openDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'import-sql' : null)}
      title="Import from SQL"
      description="Paste CREATE TABLE statements. They become a new diagram; nothing is overwritten."
    >
      {open && <SqlImport onDone={() => openDialog(null)} />}
    </Dialog>
  )
}

function SqlImport({ onDone }: { onDone: () => void }) {
  // SQL that was pasted or dropped arrives as a draft with a guessed database.
  const draft = useUi.getState().importDraft
  const [dialect, setDialect] = useState<ImportDialect>(draft?.dialect ?? 'postgres')
  const [sql, setSql] = useState(draft?.sql ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const convert = async () => {
    setBusy(true)
    setError(null)
    try {
      const source = await importSql(sql, dialect)
      useDocuments.getState().create({ name: draft?.name ?? 'Imported schema', source })
      onDone()
    } catch (caught) {
      setError(describeSqlError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void convert()
      }}
    >
      <div className="px-5 pb-3">
        <Segmented
          label="Database"
          // Four database names do not fit side by side on a phone.
          className="w-full max-sm:grid-flow-row max-sm:grid-cols-2"
          value={dialect}
          options={IMPORT_DIALECTS}
          onChange={setDialect}
        />
      </div>
      <div className="mx-5 flex min-h-0 flex-1 flex-col">
        <textarea
          aria-label="SQL statements"
          aria-invalid={error !== null}
          aria-describedby={error ? 'sql-import-error' : undefined}
          autoFocus
          spellCheck={false}
          value={sql}
          onChange={(event) => setSql(event.currentTarget.value)}
          placeholder={
            'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL\n);'
          }
          className="h-64 w-full resize-none rounded-lg border border-(--line-input) bg-panel p-4 font-mono text-xs leading-[1.7] text-ink outline-hidden placeholder:text-ink-3 focus:border-accent"
        />
        {error && (
          <p id="sql-import-error" role="alert" className="pt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
      <footer className="flex justify-end gap-2 px-5 py-4">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy || sql.trim() === ''}>
          {busy ? 'Converting…' : 'Create diagram'}
        </Button>
      </footer>
    </form>
  )
}
