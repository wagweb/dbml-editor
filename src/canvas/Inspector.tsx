import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Code2,
  Link2,
  Pencil,
  Route,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { closeDetails, focusTable, nudgeTable, revealTable } from '@/app/actions'
import { renameColumnFromDiagram, renameTableFromDiagram } from '@/app/editActions'
import {
  describeRefKind,
  type ColumnModel,
  type RecordsModel,
  type RefModel,
  type TableModel,
} from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { tableTitle } from '@/layout/geometry'
import { cn } from '@/lib/cn'
import { setPathTarget, useDiagram } from '@/store/diagram'
import { useUi, type FocusDepth } from '@/store/ui'
import { IconButton } from '@/ui/Button'
import { InlineEdit } from '@/ui/InlineEdit'
import { Segmented } from '@/ui/Segmented'

const DEPTHS = [
  { value: '1', label: 'Direct' },
  { value: '2', label: '2 steps' },
] as const

/** Everything about the selected card that does not fit on it. */
export function Inspector() {
  const model = useDiagram((s) => s.model)
  const selectedTableId = useDiagram((s) => s.selectedTableId)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const table = useMemo(
    () => model.tables.find((t) => t.id === selectedTableId),
    [model, selectedTableId],
  )
  // The id, not a flag: moving on to another table ends the rename by itself.
  const [renamingId, setRenamingId] = useState<string | null>(null)

  // Following a relation replaces the panel's content and drops focus; catch it here.
  const panel = useRef<HTMLElement>(null)
  const tableId = table?.id
  useEffect(() => {
    if (tableId && document.activeElement === document.body) panel.current?.focus()
  }, [tableId])

  if (!table) return null
  const renaming = renamingId === table.id
  const setRenaming = (on: boolean) => setRenamingId(on ? table.id : null)

  const kind = table.kind ?? 'table'
  const group = model.groups.find((g) => g.id === table.groupId)
  const subtitle = [
    kind === 'note'
      ? 'Note'
      : `${table.columns.length} ${kind === 'enum' ? 'value' : 'column'}${table.columns.length === 1 ? '' : 's'}`,
    group && !group.suggested ? `in ${group.name}` : null,
    table.alias ? `alias ${table.alias}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Details of ${kind} ${tableTitle(table)}`}
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
          {renaming ? (
            <InlineEdit
              label="Table name"
              initial={table.name}
              className="h-6 max-w-full text-sm font-semibold"
              onDone={(value) => {
                setRenaming(false)
                if (value !== null) renameTableFromDiagram(table.id, value)
              }}
            />
          ) : (
            <h2 className="line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere] text-ink">
              {tableTitle(table)}
            </h2>
          )}
          <p className="truncate text-xs text-ink-2">{subtitle}</p>
        </div>
        {kind === 'table' && !renaming && (
          <IconButton
            label="Rename table"
            shortcut="F2"
            tooltipSide="bottom"
            onClick={() => setRenaming(true)}
          >
            <Pencil />
          </IconButton>
        )}
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
        {kind === 'table' && <FocusControls table={table} />}

        {kind === 'note' && table.text && (
          <p className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {table.text}
          </p>
        )}
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

        {kind === 'enum' && <EnumSections table={table} />}
        {kind === 'table' && <TableSections table={table} />}

        <Section title="Move">
          <div className="flex items-center gap-1 px-3">
            <MoveButton tableId={table.id} label="Move left" dx={-1} dy={0}>
              <ArrowLeft />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move up" dx={0} dy={-1}>
              <ArrowUp />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move down" dx={0} dy={1}>
              <ArrowDown />
            </MoveButton>
            <MoveButton tableId={table.id} label="Move right" dx={1} dy={0}>
              <ArrowRight />
            </MoveButton>
          </div>
        </Section>
      </div>
    </aside>
  )
}

/**
 * What stays visible around the selected table, and the way to a second table. The path
 * answers "how do orders and countries hang together?" with the shortest chain.
 */
function FocusControls({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const pathTargetId = useDiagram((s) => s.pathTargetId)
  const path = useDiagram((s) => s.emphasis.path)
  const depth = useUi((s) => s.focusDepth)
  const target = pathTargetId ? model.tables.find((t) => t.id === pathTargetId) : undefined
  const nameOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  if (target && path) {
    return (
      <section className="border-b border-line px-4 pt-3 pb-3">
        <div className="flex items-center gap-1">
          <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-ink-3">
            Path to {tableTitle(target)}
          </h3>
          <IconButton
            label="Clear path"
            shortcut="Esc"
            className="-mr-2 size-7"
            onClick={() => setPathTarget(null)}
          >
            <X />
          </IconButton>
        </div>
        {path.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-2">
            No chain of relations connects {table.name} and {target.name}.
          </p>
        ) : (
          <ol className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[13px]">
            {path.map((id, index) => (
              <li key={id} className="flex items-center gap-1">
                {index > 0 && (
                  <ArrowRight role="img" aria-label="then" className="size-3 text-ink-3" />
                )}
                <button
                  type="button"
                  className="rounded-[4px] bg-fill px-1.5 py-0.5 font-medium text-ink hover:bg-fill-strong"
                  onClick={() => revealTable(id)}
                >
                  {nameOf(id)}
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-ink-3">
          {path.length > 1
            ? `${path.length - 1} ${path.length === 2 ? 'step' : 'steps'}. Shift-click another table to change the target.`
            : 'Shift-click another table to ask about a different pair.'}
        </p>
      </section>
    )
  }

  return (
    <section className="flex items-center gap-2 border-b border-line py-2 pr-2 pl-4">
      <span className="text-xs font-medium text-ink-3">Show</span>
      <Segmented
        label="Relation steps around the table"
        value={String(depth)}
        options={DEPTHS}
        onChange={(next) => useUi.getState().setFocusDepth(Number(next) as FocusDepth)}
      />
      <span className="flex-1" />
      <IconButton
        label="Path to another table"
        tooltipSide="bottom"
        onClick={() => useUi.getState().openPalette({ kind: 'path', fromId: table.id })}
      >
        <Route />
      </IconButton>
    </section>
  )
}

function TableSections({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const spotlight = useDiagram((s) =>
    s.spotlight?.tableId === table.id ? s.spotlight.column : null,
  )
  const [editing, setEditing] = useState<string | null>(null)

  const outgoing = model.refs.filter((r) => r.kind !== 'enum' && r.child.tableId === table.id)
  const incoming = model.refs.filter(
    (r) => r.kind !== 'enum' && r.parent.tableId === table.id && r.child.tableId !== table.id,
  )
  const records = model.records.filter((r) => r.tableId === table.id)
  const enums = new Map(model.enums.map((e) => [e.id, e]))
  const titleOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  return (
    <>
      <Section title="Columns">
        <ul>
          {table.columns.map((column) => (
            <ColumnDetails
              key={column.name}
              tableId={table.id}
              column={column}
              enumValues={
                column.enumId ? enums.get(column.enumId)?.values.map((v) => v.name) : undefined
              }
              spotlight={spotlight === column.name}
              editing={editing === column.name}
              onEdit={() => setEditing(column.name)}
              onEditDone={(value) => {
                setEditing(null)
                if (value !== null) {
                  renameColumnFromDiagram({ tableId: table.id, column: column.name }, value)
                }
              }}
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

      {records.length > 0 && (
        <Section title="Sample rows">
          {records.map((block, index) => (
            <SampleRows key={index} records={block} />
          ))}
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
    </>
  )
}

function EnumSections({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const users = model.refs.filter((r) => r.kind === 'enum' && r.parent.tableId === table.id)
  const titleOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  return (
    <>
      <Section title="Values">
        <ul className="px-4">
          {table.columns.map((value) => (
            <li key={value.name} className="py-1 font-mono text-xs text-ink">
              {value.name}
              {value.note && (
                <span className="mt-0.5 block font-sans text-xs text-ink-2">{value.note}</span>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {users.length > 0 && (
        <Section title="Used by">
          <ul>
            {users.map((ref) => (
              <li key={ref.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 px-4 py-1.5 text-left hover:bg-fill"
                  onClick={() => focusTable(ref.child.tableId, { focusPanel: true })}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                    {titleOf(ref.child.tableId)}
                  </span>
                  <span className="truncate font-mono text-[11px] text-ink-2">
                    {ref.child.columns.join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

/** Rows declared with `Records`, as a small table that scrolls sideways. */
function SampleRows({ records }: { records: RecordsModel }) {
  return (
    <div className="mx-4 overflow-x-auto rounded-[6px] shadow-[inset_0_0_0_1px_var(--line)]">
      <table className="w-full border-collapse font-mono text-[11px] text-ink">
        <thead>
          <tr>
            {records.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-line bg-fill px-2 py-1 text-left font-medium whitespace-nowrap text-ink-2"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line last:border-b-0">
              {records.columns.map((column, columnIndex) => {
                const value = row[columnIndex]
                return (
                  <td
                    key={column}
                    className={cn(
                      'max-w-40 truncate px-2 py-1 whitespace-nowrap',
                      value === null && 'text-ink-3',
                    )}
                  >
                    {value === null ? 'null' : String(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  tableId: string
  column: ColumnModel
  enumValues: string[] | undefined
  spotlight: boolean
  editing: boolean
  onEdit: () => void
  onEditDone: (value: string | null) => void
}

/**
 * One column with its settings. The row jumps to the code; the two small buttons rename
 * the column or start a relation from it, which keeps both reachable without dragging.
 */
function ColumnDetails({
  tableId,
  column,
  enumValues,
  spotlight,
  editing,
  onEdit,
  onEditDone,
}: ColumnDetailsProps) {
  const row = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (spotlight) row.current?.scrollIntoView({ block: 'nearest' })
  }, [spotlight])

  const tags = [
    column.pk && 'primary key',
    column.fk && 'foreign key',
    column.unique && 'unique',
    column.notNull && 'not null',
    column.increment && 'auto increment',
    column.defaultValue !== undefined && `default ${column.defaultValue}`,
  ].filter((tag): tag is string => Boolean(tag))

  return (
    <li
      ref={row}
      className="group/detail flex items-start gap-1 pr-2 focus-within:bg-fill hover:bg-fill"
      data-spotlight={spotlight}
    >
      {editing ? (
        <div className="flex h-9 flex-1 items-center pl-4">
          <InlineEdit
            label="Column name"
            initial={column.name}
            mono
            className="h-6 flex-1 text-xs"
            onDone={onEditDone}
          />
        </div>
      ) : (
        <button
          type="button"
          className="block min-w-0 flex-1 py-1.5 pl-4 text-left"
          onClick={() => revealInEditor(column.range)}
        >
          <span className="flex items-baseline gap-3 font-mono text-xs">
            <span
              className={`min-w-0 flex-1 truncate text-ink ${column.pk ? 'font-semibold' : ''}`}
            >
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
      )}
      {!editing && (
        <span className="flex shrink-0 items-center pt-0.5 opacity-0 group-focus-within/detail:opacity-100 group-hover/detail:opacity-100">
          <IconButton label={`Rename ${column.name}`} className="size-7" onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton
            label={`Add relation from ${column.name}`}
            className="size-7"
            onClick={() =>
              useUi
                .getState()
                .openPalette({ kind: 'relation', from: { tableId, column: column.name } })
            }
          >
            <Link2 />
          </IconButton>
        </span>
      )}
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
