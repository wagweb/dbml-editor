import { CircleAlert, CircleCheck, Lightbulb, TriangleAlert } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { describeFix } from '@/dbml/fixes'
import type { Hint, HintKind } from '@/dbml/hints'
import { isTable } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { Button } from '@/ui/Button'
import { Kbd } from '@/ui/Kbd'
import { RING_ALIGN_OFFSET } from '@/ui/Menu'
import { focusTable, goToFirstProblem } from './actions'
import { DBML_DOCS_URL } from './constants'
import { addIndexesFromDiagram, applyHintFix } from './editActions'

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? '' : 's'}`
}

/** One line under the editor: either what the schema contains or what is wrong with it. */
export function StatusBar() {
  const diagnostics = useDiagram((s) => s.diagnostics)
  const hints = useDiagram((s) => s.hints)
  const showHints = useUi((s) => s.showHints)
  const keyboardInEditor = useUi((s) => s.editorKeyboardFocus)
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
            title={first.message}
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
        ) : tables === 0 ? (
          <p className="truncate">No tables yet</p>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-1.5">
            <CircleCheck aria-hidden className="size-3.5 shrink-0 text-ok" />
            <span className="truncate">
              {tableCount}, {count(refs, 'relation')}
            </span>
          </p>
        )}
      </div>
      {keyboardInEditor ? (
        // Tab indents in the editor, so the way out has to be visible.
        <p className="flex shrink-0 items-center gap-1">
          To leave, press <Kbd shortcut="Esc" /> then <Kbd shortcut="Tab" />
        </p>
      ) : (
        <>
          {showHints && hints.length > 0 && !first && <HintsButton hints={hints} />}
          <a
            href={DBML_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-6 shrink-0 items-center underline-offset-2 hover:text-ink hover:underline"
          >
            DBML syntax
          </a>
        </>
      )}
    </footer>
  )
}

const HINT_GROUPS: { kind: HintKind; title: string }[] = [
  { kind: 'no-primary-key', title: 'Tables without a primary key' },
  { kind: 'unindexed-foreign-key', title: 'Foreign keys without an index' },
  { kind: 'type-mismatch', title: 'Relations between different types' },
  { kind: 'naming', title: 'Names that break the pattern' },
]

/** Where a hint points, as the code spells it. */
function hintTarget(hint: Hint, names: Map<string, string>): string {
  const table = names.get(hint.tableId) ?? hint.tableId
  return hint.column ? `${table}.${hint.column}` : table
}

/** Advice about the schema, grouped by kind and kept out of the way until asked for. */
function HintsButton({ hints }: { hints: Hint[] }) {
  const [open, setOpen] = useState(false)
  const model = useDiagram((s) => s.fullModel)
  const names = new Map(model.tables.map((t) => [t.id, t.name]))
  const reveal = (hint: Hint) => {
    setOpen(false)
    focusTable(hint.tableId, { zoom: true })
    revealInEditor(hint.range)
  }
  const indexTargets = (items: Hint[]) =>
    items.flatMap((hint) => {
      const ref = model.refs.find(
        (r) => r.child.tableId === hint.tableId && r.child.columns[0] === hint.column,
      )
      return ref ? [{ tableId: hint.tableId, columns: ref.child.columns }] : []
    })

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
          alignOffset={RING_ALIGN_OFFSET}
          sideOffset={8}
          collisionPadding={8}
          aria-label="Schema hints"
          className="z-40 flex max-h-[min(440px,60vh)] w-[min(380px,calc(100vw-24px))] origin-(--radix-popover-content-transform-origin) animate-pop-in flex-col rounded-panel bg-surface shadow-pop outline-none"
        >
          <div className="flex items-center justify-between border-b border-line py-1.5 pr-1.5 pl-4">
            <h2 className="text-[13px] font-semibold text-ink">Schema hints</h2>
            <Button
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                useUi.getState().setShowHints(false)
                setOpen(false)
              }}
            >
              Turn off
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain pb-1.5">
            {HINT_GROUPS.map(({ kind, title }) => {
              const items = hints.filter((h) => h.kind === kind)
              if (items.length === 0) return null
              // For these two the heading says it all; the rows only name the place.
              const terse = kind === 'no-primary-key' || kind === 'unindexed-foreign-key'
              const fixable = kind === 'unindexed-foreign-key' ? indexTargets(items) : []
              return (
                <section key={kind} className="pt-2">
                  <div className="flex items-center gap-2 px-4 pb-1">
                    <h3 className="min-w-0 flex-1 text-xs font-medium text-ink-3">
                      {title} <span className="tabular-nums">({items.length})</span>
                    </h3>
                    {fixable.length > 1 && (
                      <Button
                        variant="ghost"
                        className="-mr-2 h-6 px-2 text-xs"
                        onClick={() => {
                          setOpen(false)
                          addIndexesFromDiagram(fixable)
                        }}
                      >
                        Add all {fixable.length}
                      </Button>
                    )}
                  </div>
                  <ul className="px-1.5">
                    {items.map((hint, index) => {
                      const fix = describeFix(hint, model)
                      return (
                        <li
                          key={`${hint.tableId}:${hint.column ?? ''}:${index}`}
                          className="flex items-center rounded-control hover:bg-fill"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 px-2.5 py-1.5 text-left"
                            onClick={() => reveal(hint)}
                          >
                            {terse ? (
                              <span className="block truncate font-mono text-xs text-ink">
                                {hintTarget(hint, names)}
                              </span>
                            ) : (
                              <span className="block text-[13px] leading-snug text-ink">
                                {hint.message}
                              </span>
                            )}
                          </button>
                          {fix && (
                            <Button
                              variant="ghost"
                              className="mr-1 h-6 max-w-[45%] shrink-0 px-2 text-xs"
                              onClick={() => {
                                setOpen(false)
                                applyHintFix(hint)
                              }}
                            >
                              <span className="truncate">{fix.label}</span>
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
