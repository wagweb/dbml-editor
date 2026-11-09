import { CircleAlert, CircleCheck, Lightbulb, TriangleAlert } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { isTable } from '@/dbml/model'
import type { Hint } from '@/dbml/hints'
import { revealInEditor } from '@/editor/bridge'
import { useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { focusTable, goToFirstProblem } from './actions'
import { DBML_DOCS_URL } from './constants'

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`
}

/** One line under the editor: either what the schema contains or what is wrong with it. */
export function StatusBar() {
  const diagnostics = useDiagram((s) => s.diagnostics)
  const hints = useDiagram((s) => s.hints)
  const showHints = useUi((s) => s.showHints)
  const tables = useDiagram((s) => s.fullModel.tables.filter(isTable).length)
  const shown = useDiagram((s) => s.model.tables.filter(isTable).length)
  const view = useDiagram((s) => s.view)
  const refs = useDiagram((s) => s.fullModel.refs.length)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.length - errors.length
  const first = errors[0] ?? diagnostics[0]
  const summary = [
    errors.length > 0 && count(errors.length, 'error'),
    warnings > 0 && count(warnings, 'warning'),
  ]
    .filter(Boolean)
    .join(', ')
  const tableCount =
    view !== null && shown !== tables ? `${shown} of ${tables} tables` : count(tables, 'table')

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
              {tableCount}, {count(refs, 'relation')}
            </span>
          </p>
        )}
      </div>
      {showHints && hints.length > 0 && !first && <HintsButton hints={hints} />}
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

/** Advice about the schema, kept out of the way until asked for. */
function HintsButton({ hints }: { hints: Hint[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="flex h-6 shrink-0 items-center gap-1 rounded-control px-1.5 text-xs text-ink-2 hover:bg-fill hover:text-ink data-[state=open]:bg-fill data-[state=open]:text-ink"
        aria-label={`${count(hints.length, 'hint')} about the schema`}
      >
        <Lightbulb aria-hidden className="size-3.5" />
        {count(hints.length, 'hint')}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="z-40 w-[min(380px,calc(100vw-24px))] origin-(--radix-popover-content-transform-origin) animate-pop-in rounded-panel bg-surface p-1 shadow-pop outline-none"
        >
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
            <h2 className="text-xs font-medium text-ink-3">Schema hints</h2>
            <button
              type="button"
              className="text-xs text-ink-3 hover:text-ink"
              onClick={() => {
                useUi.getState().setShowHints(false)
                setOpen(false)
              }}
            >
              Turn off
            </button>
          </div>
          <ul className="max-h-[min(320px,50vh)] overflow-y-auto">
            {hints.map((hint, index) => (
              <li key={`${hint.tableId}:${hint.column ?? ''}:${hint.kind}:${index}`}>
                <button
                  type="button"
                  className="flex w-full rounded-control px-2.5 py-1.5 text-left hover:bg-fill"
                  onClick={() => {
                    setOpen(false)
                    focusTable(hint.tableId)
                    revealInEditor(hint.range)
                  }}
                >
                  <span className="text-[13px] leading-snug text-ink">{hint.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
