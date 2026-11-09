import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { useDiagram } from '@/store/diagram'
import { goToFirstProblem } from './actions'
import { DBML_DOCS_URL } from './constants'

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`
}

/** One line under the editor: either what the schema contains or what is wrong with it. */
export function StatusBar() {
  const diagnostics = useDiagram((s) => s.diagnostics)
  const tables = useDiagram((s) => s.model.tables.length)
  const refs = useDiagram((s) => s.model.refs.length)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.length - errors.length
  const first = errors[0] ?? diagnostics[0]
  const summary = [
    errors.length > 0 && count(errors.length, 'error'),
    warnings > 0 && count(warnings, 'warning'),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-3 text-xs text-ink-2">
      {/* Always mounted, so screen readers hear when the state of the schema changes. */}
      <div role="status" className="flex min-w-0 flex-1 items-center">
        {first ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-ink"
            onClick={goToFirstProblem}
          >
            {/* Errors and warnings differ by icon shape, not only by colour. */}
            {errors.length > 0 ? (
              <CircleAlert aria-hidden className="size-3.5 shrink-0 text-danger" />
            ) : (
              <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
            )}
            <span className="shrink-0 font-medium text-ink">{summary}</span>
            <span className="truncate">{first.message}</span>
          </button>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-1.5">
            <CircleCheck aria-hidden className="size-3.5 shrink-0 text-ok" />
            <span className="truncate">
              {count(tables, 'table')}, {count(refs, 'relation')}
            </span>
          </p>
        )}
      </div>
      <a
        href={DBML_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 underline-offset-2 hover:text-ink hover:underline"
      >
        DBML syntax
      </a>
    </footer>
  )
}
