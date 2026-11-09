import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Code2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { closeDetails, focusTable, nudgeTable } from '@/app/actions'
import { describeRefKind, type ColumnModel, type RefModel } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { tableTitle } from '@/layout/geometry'
import { cn } from '@/lib/cn'
import { useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { IconButton } from '@/ui/Button'

/** Everything about the selected table that does not fit on its card. */
export function Inspector() {
  const model = useDiagram((s) => s.model)
  const selectedTableId = useDiagram((s) => s.selectedTableId)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const table = useMemo(
    () => model.tables.find((t) => t.id === selectedTableId),
    [model, selectedTableId],
  )

  // Following a relation replaces the panel's content and drops focus; catch it here.
  const panel = useRef<HTMLElement>(null)
  const tableId = table?.id
  useEffect(() => {
    if (tableId && document.activeElement === document.body) panel.current?.focus()
  }, [tableId])

  if (!table) return null

  const group = model.groups.find((g) => g.id === table.groupId)
  const outgoing = model.refs.filter((r) => r.child.tableId === table.id)
  const incoming = model.refs.filter(
    (r) => r.parent.tableId === table.id && r.child.tableId !== table.id,
  )
  const enums = new Map(model.enums.map((e) => [e.id, e]))
  const titleOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Details of table ${tableTitle(table)}`}
      data-details
      data-canvas-interactive
      data-canvas-scrollable
      // Leaves room for the overview map below when it is shown.
      className={cn(
        'absolute top-4 right-4 z-10 flex w-80 animate-sheet-in flex-col rounded-panel bg-surface shadow-pop outline-hidden max-md:inset-x-3 max-md:top-auto max-md:bottom-20 max-md:max-h-[52%] max-md:w-auto',
        minimapOpen ? 'md:max-h-[calc(100%-164px)]' : 'md:max-h-[calc(100%-32px)]',
      )}
    >
      <header className="flex items-center gap-1 border-b border-line py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{tableTitle(table)}</h2>
          <p className="truncate text-xs text-ink-2">
            {table.columns.length} {table.columns.length === 1 ? 'column' : 'columns'}
            {group ? `, in ${group.name}` : ''}
            {table.alias ? `, alias ${table.alias}` : ''}
          </p>
        </div>
        <IconButton
          label="Show in code"
          tooltipSide="bottom"
          onClick={() => revealInEditor(table.range, { focus: true })}
        >
          <Code2 />
        </IconButton>
        <IconButton
          label="Close details"
          shortcut="Esc"
          tooltipSide="bottom"
          onClick={closeDetails}
        >
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {table.note && (
          <p className="border-b border-line px-4 py-3 text-[13px] whitespace-pre-wrap text-ink-2">
            {table.note}
          </p>
        )}
        {group?.note && (
          <p className="border-b border-line px-4 py-3 text-[13px] whitespace-pre-wrap text-ink-2">
            <span className="font-medium text-ink">{group.name}: </span>
            {group.note}
          </p>
        )}

        <Section title="Columns">
          <ul>
            {table.columns.map((column) => (
              <ColumnDetails
                key={column.name}
                column={column}
                enumValues={
                  column.enumId ? enums.get(column.enumId)?.values.map((v) => v.name) : undefined
                }
                onReveal={() => revealInEditor(column.range)}
              />
            ))}
          </ul>
        </Section>

        {outgoing.length > 0 && (
          <Section title="References">
            <ul>
              {outgoing.map((ref) => (
                <RelationRow
                  key={ref.id}
                  reference={ref}
                  label={titleOf(ref.parent.tableId)}
                  from={ref.child.columns.join(', ')}
                  to={ref.parent.columns.join(', ')}
                  targetId={ref.parent.tableId}
                />
              ))}
            </ul>
          </Section>
        )}

        {incoming.length > 0 && (
          <Section title="Referenced by">
            <ul>
              {incoming.map((ref) => (
                <RelationRow
                  key={ref.id}
                  reference={ref}
                  label={titleOf(ref.child.tableId)}
                  from={ref.child.columns.join(', ')}
                  to={ref.parent.columns.join(', ')}
                  targetId={ref.child.tableId}
                />
              ))}
            </ul>
          </Section>
        )}

        {table.indexes.length > 0 && (
          <Section title="Indexes">
            <ul className="px-4">
              {table.indexes.map((index, i) => (
                <li key={i} className="flex min-h-7 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                    {index.columns.join(', ')}
                  </span>
                  {index.pk && <Tag>primary key</Tag>}
                  {index.unique && <Tag>unique</Tag>}
                  {index.name && <span className="truncate text-xs text-ink-3">{index.name}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Move">
          <div className="flex items-center gap-1 px-3">
            <MoveButton tableId={table.id} label="Move table left" dx={-1} dy={0}>
              <ArrowLeft />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move table up" dx={0} dy={-1}>
              <ArrowUp />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move table down" dx={0} dy={1}>
              <ArrowDown />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move table right" dx={1} dy={0}>
              <ArrowRight />
            </MoveButton>
          </div>
        </Section>
      </div>
    </aside>
  )
}

interface MoveButtonProps {
  tableId: string
  label: string
  dx: number
  dy: number
  children: ReactNode
}

/** Moving without dragging, for people who cannot or do not want to drag. */
function MoveButton({ tableId, label, dx, dy, children }: MoveButtonProps) {
  return (
    <IconButton label={label} tooltipSide="top" onClick={() => nudgeTable(tableId, dx, dy)}>
      {children}
    </IconButton>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-3">
      <h3 className="px-4 pb-1 text-xs font-medium text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-fill px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap text-ink-2">
      {children}
    </span>
  )
}

interface ColumnDetailsProps {
  column: ColumnModel
  enumValues: string[] | undefined
  onReveal: () => void
}

function ColumnDetails({ column, enumValues, onReveal }: ColumnDetailsProps) {
  const tags = [
    column.pk && 'primary key',
    column.fk && 'foreign key',
    column.unique && 'unique',
    column.notNull && 'not null',
    column.increment && 'auto increment',
    column.defaultValue !== undefined && `default ${column.defaultValue}`,
  ].filter((tag): tag is string => Boolean(tag))

  return (
    <li>
      <button
        type="button"
        className="block w-full px-4 py-1.5 text-left hover:bg-fill"
        onClick={onReveal}
      >
        <span className="flex items-baseline gap-3 font-mono text-xs">
          <span className={`min-w-0 flex-1 truncate text-ink ${column.pk ? 'font-semibold' : ''}`}>
            {column.name}
          </span>
          <span className="max-w-[55%] truncate text-ink-3">{column.type}</span>
        </span>
        {tags.length > 0 && (
          <span className="mt-0.5 block text-xs text-ink-2">{tags.join(', ')}</span>
        )}
        {enumValues && (
          <span className="mt-1 block font-mono text-[11px] leading-4 text-ink-2">
            {enumValues.join(' | ')}
          </span>
        )}
        {column.note && <span className="mt-1 block text-xs text-ink-2">{column.note}</span>}
      </button>
    </li>
  )
}

interface RelationRowProps {
  reference: RefModel
  label: string
  from: string
  to: string
  targetId: string
}

function RelationRow({ reference, label, from, to, targetId }: RelationRowProps) {
  const actions = [
    reference.onDelete && `on delete ${reference.onDelete}`,
    reference.onUpdate && `on update ${reference.onUpdate}`,
  ].filter(Boolean)

  return (
    <li>
      <button
        type="button"
        className="block w-full px-4 py-1.5 text-left hover:bg-fill"
        onClick={() => focusTable(targetId, { focusPanel: true })}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{label}</span>
          <span className="shrink-0 text-xs text-ink-3">{describeRefKind(reference.kind)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
          <span className="truncate">{from}</span>
          <ArrowRight role="img" aria-label="references" className="size-3 shrink-0" />
          <span className="truncate">{to}</span>
        </span>
        {(reference.name || actions.length > 0) && (
          <span className="mt-0.5 block text-[11px] text-ink-3">
            {[reference.name, ...actions].filter(Boolean).join(', ')}
          </span>
        )}
      </button>
    </li>
  )
}
