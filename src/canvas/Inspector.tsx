import {
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Code2,
  Copy,
  KeyRound,
  Link2,
  Pencil,
  Route,
  StickyNote,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { closeDetails, copyJoinQuery, focusTable, nudgeTable, revealTable } from '@/app/actions'
import { renameColumnFromDiagram, renameTableFromDiagram } from '@/app/editActions'
import { withinSteps } from '@/dbml/graph'
import {
  describeRefKind,
  type ColumnModel,
  type RecordsModel,
  type RefModel,
  type SchemaModel,
  type TableModel,
} from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { tableTitle } from '@/layout/geometry'
import { tableTones } from '@/layout/groups'
import { cn } from '@/lib/cn'
import { setHover, setPathTarget, useDiagram } from '@/store/diagram'
import { useUi, type DetailsTab, type FocusDepth } from '@/store/ui'
import { Button, IconButton } from '@/ui/Button'
import { InlineEdit } from '@/ui/InlineEdit'
import { SegmentCount, Segmented, TabList, TabPanel, Tabs } from '@/ui/Segmented'

/**
 * Everything about the selected card that does not fit on it. A table's details come in
 * tabs: its columns, its relations (which also say how far the highlight reaches), and,
 * when there are any, its indexes and sample rows.
 */
export function Inspector() {
  const model = useDiagram((s) => s.model)
  const selectedTableId = useDiagram((s) => s.selectedTableId)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const readOnly = useUi((s) => s.viewer !== null)
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
  const kind = table.kind ?? 'table'
  const renaming = renamingId === table.id
  const setRenaming = (on: boolean) => setRenamingId(on ? table.id : null)

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
        'absolute top-4 right-4 z-10 flex w-[352px] animate-sheet-in flex-col rounded-panel bg-surface shadow-pop outline-hidden max-md:inset-x-3 max-md:top-auto max-md:bottom-20 max-md:max-h-[52%] max-md:w-auto',
        minimapOpen ? 'md:max-h-[calc(100%-164px)]' : 'md:max-h-[calc(100%-32px)]',
      )}
    >
      <header className="flex items-start gap-1 pt-2 pr-1.5 pb-1 pl-4">
        <div className="min-w-0 flex-1 py-1">
          {renaming ? (
            <InlineEdit
              label="Table name"
              initial={table.name}
              className="h-7 max-w-full text-[15px] font-semibold"
              onDone={(value) => {
                setRenaming(false)
                if (value !== null) renameTableFromDiagram(table.id, value)
              }}
            />
          ) : (
            <h2 className="text-[15px] leading-snug font-semibold [overflow-wrap:anywhere] text-ink">
              {tableTitle(table)}
            </h2>
          )}
          <Facts table={table} model={model} />
        </div>
        {kind === 'table' && !renaming && !readOnly && (
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

      {table.note && (
        <p className="px-4 pb-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {table.note}
        </p>
      )}
      {kind === 'note' && table.text && (
        <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
          {table.text}
        </p>
      )}

      {kind === 'table' && <PathCard table={table} />}
      {kind === 'table' && <TableTabs table={table} />}
      {kind === 'enum' && <EnumDetails table={table} />}

      {kind === 'table' && <Footer table={table} />}
    </aside>
  )
}

/** Group, alias and kind as small chips under the name. */
function Facts({ table, model }: { table: TableModel; model: SchemaModel }) {
  const kind = table.kind ?? 'table'
  const group = model.groups.find((g) => g.id === table.groupId)
  const tone = useMemo(() => tableTones(model).get(table.id), [model, table.id])
  const chips: ReactNode[] = []
  if (kind !== 'table') chips.push(<Chip key="kind">{kind}</Chip>)
  if (group) {
    chips.push(
      <Chip key="group" dot={tone}>
        {group.name}
        {group.suggested && <span className="text-ink-3">, suggested</span>}
      </Chip>,
    )
  }
  if (table.alias) chips.push(<Chip key="alias">alias {table.alias}</Chip>)
  if (chips.length === 0) return null
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{chips}</div>
}

function Chip({ dot, children }: { dot?: string; children: ReactNode }) {
  return (
    <span className="inline-flex h-5 max-w-full items-center gap-1.5 rounded-full bg-fill px-2 text-xs text-ink-2">
      {dot && (
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      )}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** The answer to "how do these two tables hang together", while a path is asked for. */
function PathCard({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const pathTargetId = useDiagram((s) => s.pathTargetId)
  const path = useDiagram((s) => s.emphasis.path)
  const headingId = useId()
  const target = pathTargetId ? model.tables.find((t) => t.id === pathTargetId) : undefined
  if (!target || !path) return null
  const nameOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  return (
    <section aria-labelledby={headingId} className="mx-3 mb-3 rounded-lg bg-fill p-3">
      <div className="flex items-center gap-1">
        <h3 id={headingId} className="min-w-0 flex-1 truncate text-xs font-medium text-ink-2">
          Path to {tableTitle(target)}
        </h3>
        <IconButton
          label="Clear path"
          shortcut="Esc"
          className="-my-1 -mr-1.5 size-7"
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
        <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[13px]">
          {path.map((id, index) => (
            <li key={id} className="flex items-center gap-1">
              {index > 0 && (
                <ArrowRight role="img" aria-label="then" className="size-3 text-ink-3" />
              )}
              <button
                type="button"
                className="rounded-[5px] bg-surface px-1.5 py-0.5 font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--line-strong)]"
                onClick={() => revealTable(id)}
              >
                {nameOf(id)}
              </button>
            </li>
          ))}
        </ol>
      )}
      {path.length > 1 && (
        // The question "how do these hang together" usually ends in a query.
        <Button
          variant="secondary"
          className="mt-3 h-7 px-2.5 text-xs"
          onClick={() => void copyJoinQuery(model, path)}
        >
          <Copy aria-hidden className="size-3.5" />
          Copy SQL query
        </Button>
      )}
      <p className="mt-2 text-xs text-ink-2">
        {path.length > 1
          ? `${path.length - 1} ${path.length === 2 ? 'step' : 'steps'}. Shift-click another table to change the target.`
          : 'Shift-click another table to ask about a different pair.'}
      </p>
    </section>
  )
}

function TableTabs({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const chosen = useUi((s) => s.detailsTab)
  const spotlight = useDiagram((s) =>
    s.spotlight?.tableId === table.id ? s.spotlight.column : null,
  )
  const records = model.records.filter((r) => r.tableId === table.id)
  const relations = model.refs.filter(
    (r) => r.kind !== 'enum' && (r.child.tableId === table.id || r.parent.tableId === table.id),
  )

  const tabs: { value: DetailsTab; label: ReactNode }[] = [
    { value: 'columns', label: counted('Columns', table.columns.length) },
    { value: 'relations', label: counted('Relations', relations.length) },
  ]
  if (table.indexes.length > 0) {
    tabs.push({ value: 'indexes', label: counted('Indexes', table.indexes.length) })
  }
  if (records.length > 0) tabs.push({ value: 'data', label: 'Data' })
  // A tab this table does not have falls back to the columns.
  const tab = tabs.some((t) => t.value === chosen) ? chosen : 'columns'

  // A column found by search is shown with its details open.
  useEffect(() => {
    if (spotlight) useUi.getState().setDetailsTab('columns')
  }, [spotlight])

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => useUi.getState().setDetailsTab(next as DetailsTab)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="px-3 pb-2">
        <TabList label="Table details" value={tab} tabs={tabs} className="w-full" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line">
        <TabPanel value="columns" className="outline-hidden">
          <ColumnList table={table} spotlight={spotlight} />
        </TabPanel>
        <TabPanel value="relations" className="outline-hidden">
          <RelationsPanel table={table} />
        </TabPanel>
        <TabPanel value="indexes" className="outline-hidden">
          <IndexList table={table} />
        </TabPanel>
        <TabPanel value="data" className="space-y-3 py-3 outline-hidden">
          <h3 className="sr-only">Sample rows</h3>
          {records.map((block, index) => (
            <SampleRows key={index} records={block} />
          ))}
        </TabPanel>
      </div>
    </Tabs>
  )
}

function counted(label: string, count: number): ReactNode {
  return (
    <>
      {label}
      <SegmentCount>{count}</SegmentCount>
    </>
  )
}

// ---------------------------------------------------------------- columns

function ColumnList({ table, spotlight }: { table: TableModel; spotlight: string | null }) {
  const [open, setOpen] = useState<string | null>(spotlight)
  const [editing, setEditing] = useState<string | null>(null)
  // A column found by search opens; adjusted while rendering, not in an effect.
  const [shownSpotlight, setShownSpotlight] = useState(spotlight)
  if (spotlight !== shownSpotlight) {
    setShownSpotlight(spotlight)
    if (spotlight) setOpen(spotlight)
  }

  return (
    <ul className="p-1.5">
      {table.columns.map((column) => (
        <ColumnRow
          key={column.name}
          table={table}
          column={column}
          open={open === column.name}
          spotlight={spotlight === column.name}
          editing={editing === column.name}
          onToggle={() => setOpen(open === column.name ? null : column.name)}
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
  )
}

interface ColumnRowProps {
  table: TableModel
  column: ColumnModel
  open: boolean
  spotlight: boolean
  editing: boolean
  onToggle: () => void
  onEdit: () => void
  onEditDone: (value: string | null) => void
}

/**
 * One line per column, so a long table can be scanned: key, full name, type. A `?` after
 * the type marks a column that may be null, which is rarer than "not null" in most schemas
 * and so the quieter way round. A click opens the rest: default, note, enum values, what
 * the column points at and what points at it, and the actions.
 */
function ColumnRow({
  table,
  column,
  open,
  spotlight,
  editing,
  onToggle,
  onEdit,
  onEditDone,
}: ColumnRowProps) {
  const row = useRef<HTMLLIElement>(null)
  const detailsId = useId()
  const nullable = !column.notNull && !column.pk
  useEffect(() => {
    if (spotlight) row.current?.scrollIntoView({ block: 'nearest' })
  }, [spotlight])

  return (
    <li
      ref={row}
      data-spotlight={spotlight}
      className={cn(
        'rounded-control has-[>button:focus-visible]:shadow-[inset_0_0_0_1.5px_var(--accent)]',
        open ? 'bg-fill' : 'hover:bg-fill',
      )}
    >
      {editing ? (
        <div className="flex h-8 items-center pr-2 pl-[30px]">
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
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex w-full items-start gap-2 rounded-control px-2 py-[7px] text-left outline-hidden"
          onClick={onToggle}
        >
          <KeyMark column={column} />
          <span
            className={cn(
              'min-w-0 flex-1 font-mono text-xs leading-[18px] [overflow-wrap:anywhere] text-ink',
              column.pk && 'font-semibold',
            )}
          >
            {column.name}
            {column.note && (
              <StickyNote
                role="img"
                aria-label="has a note"
                className="ml-1.5 inline size-3 -translate-y-px text-ink-3"
              />
            )}
          </span>
          <span className="max-w-[46%] shrink-0 text-right font-mono text-xs leading-[18px] [overflow-wrap:anywhere] text-ink-2">
            {column.type}
            {nullable && (
              <>
                <span aria-hidden className="text-ink-3">
                  ?
                </span>
                <span className="sr-only">, may be null</span>
              </>
            )}
            {/* The name comes first when read out; the key mark follows it. */}
            {column.pk && <span className="sr-only">, primary key</span>}
            {column.fk && !column.pk && <span className="sr-only">, foreign key</span>}
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              'mt-0.5 size-3.5 shrink-0 text-ink-3 transition-transform duration-150',
              open && 'rotate-90',
            )}
          />
        </button>
      )}
      {open && !editing && (
        <ColumnFacts id={detailsId} table={table} column={column} onEdit={onEdit} />
      )}
    </li>
  )
}

function KeyMark({ column }: { column: ColumnModel }) {
  if (column.pk) {
    return (
      <span className="flex h-[18px] w-3.5 shrink-0 items-center">
        <KeyRound aria-hidden className="size-3 text-ink" strokeWidth={2.25} />
      </span>
    )
  }
  if (column.fk) {
    return (
      <span className="flex h-[18px] w-3.5 shrink-0 items-center">
        <ArrowUpRight aria-hidden className="size-3.5 text-ink-2" />
      </span>
    )
  }
  return <span aria-hidden className="w-3.5 shrink-0" />
}

interface ColumnFactsProps {
  id: string
  table: TableModel
  column: ColumnModel
  onEdit: () => void
}

/** The opened part of a column row: everything else that is known, and what can be done. */
function ColumnFacts({ id, table, column, onEdit }: ColumnFactsProps) {
  const model = useDiagram((s) => s.model)
  const readOnly = useUi((s) => s.viewer !== null)
  const enumValues = column.enumId
    ? model.enums.find((e) => e.id === column.enumId)?.values.map((v) => v.name)
    : undefined
  const titleOf = (tableId: string) => {
    const other = model.tables.find((t) => t.id === tableId)
    return other ? tableTitle(other) : tableId
  }
  const pointsTo = model.refs.filter(
    (r) =>
      r.kind !== 'enum' && r.child.tableId === table.id && r.child.columns.includes(column.name),
  )
  const pointedAtBy = model.refs.filter(
    (r) =>
      r.kind !== 'enum' && r.parent.tableId === table.id && r.parent.columns.includes(column.name),
  )
  const constraints = [
    column.pk && 'primary key',
    column.unique && 'unique',
    column.increment && 'auto increment',
    column.pk || column.notNull ? 'not null' : 'may be null',
  ].filter((fact): fact is string => Boolean(fact))

  return (
    <div id={id} className="pr-2.5 pb-2.5 pl-[30px] text-xs">
      <div className="flex flex-wrap gap-1">
        {constraints.map((fact) => (
          <span key={fact} className="rounded-[4px] bg-surface px-1.5 py-px text-[11px] text-ink-2">
            {fact}
          </span>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
        {column.defaultValue !== undefined && (
          <Fact term="Default">
            <span className="font-mono text-ink">{column.defaultValue}</span>
          </Fact>
        )}
        {enumValues && (
          <Fact term="Values">
            <span className="flex flex-wrap gap-1 font-mono text-[11px] text-ink">
              {enumValues.map((value) => (
                <span key={value} className="rounded-[4px] bg-surface px-1.5 py-px">
                  {value}
                </span>
              ))}
            </span>
          </Fact>
        )}
        {pointsTo.length > 0 && (
          <Fact term="Points to">
            {pointsTo.map((ref) => (
              <TableLink
                key={ref.id}
                tableId={ref.parent.tableId}
                label={`${titleOf(ref.parent.tableId)}.${ref.parent.columns.join(', ')}`}
              />
            ))}
          </Fact>
        )}
        {pointedAtBy.length > 0 && (
          <Fact term="Used by">
            {pointedAtBy.map((ref) => (
              <TableLink
                key={ref.id}
                tableId={ref.child.tableId}
                label={`${titleOf(ref.child.tableId)}.${ref.child.columns.join(', ')}`}
              />
            ))}
          </Fact>
        )}
      </dl>
      {column.note && (
        <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {column.note}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {!readOnly && (
          <>
            <SmallAction label={`Rename ${column.name}`} icon={<Pencil />} onClick={onEdit}>
              Rename
            </SmallAction>
            <SmallAction
              label={`Add relation from ${column.name}`}
              icon={<Link2 />}
              onClick={() =>
                useUi.getState().openPalette({
                  kind: 'relation',
                  from: { tableId: table.id, column: column.name },
                })
              }
            >
              Add relation
            </SmallAction>
          </>
        )}
        <SmallAction
          label={`Show ${column.name} in code`}
          icon={<Code2 />}
          onClick={() => revealInEditor(column.range, { focus: true })}
        >
          Show in code
        </SmallAction>
      </div>
    </div>
  )
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="leading-5 text-ink-2">{term}</dt>
      <dd className="flex min-w-0 flex-col items-start gap-0.5 leading-5">{children}</dd>
    </>
  )
}

function TableLink({ tableId, label }: { tableId: string; label: string }) {
  return (
    <button
      type="button"
      className="max-w-full truncate font-mono text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
      onClick={() => focusTable(tableId, { focusPanel: true })}
    >
      {label}
    </button>
  )
}

interface SmallActionProps {
  label: string
  icon: ReactNode
  onClick: () => void
  children: ReactNode
}

function SmallAction({ label, icon, onClick, children }: SmallActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-7 items-center gap-1 rounded-control bg-surface px-1.5 text-xs font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill-strong [&_svg]:size-3.5 [&_svg]:text-ink-2"
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- relations

const DEPTHS: { value: `${FocusDepth}`; text: string }[] = [
  { value: '1', text: 'Direct' },
  { value: '2', text: '2 steps' },
]

/**
 * The tables this one is related to, as they light up on the diagram. The reach of the
 * highlight is chosen here, with the count each choice lights, and two steps out lists the
 * extra tables, so the panel always names what the diagram shows.
 */
function RelationsPanel({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const depth = useUi((s) => s.focusDepth)
  const titleOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }
  const relational = useMemo(
    () => ({ ...model, refs: model.refs.filter((r) => r.kind !== 'enum') }),
    [model],
  )
  const distance = useMemo(() => withinSteps(relational, table.id, 2), [relational, table.id])
  const direct = [...distance].filter(([, d]) => d === 1).map(([id]) => id)
  const twoSteps = [...distance].filter(([, d]) => d === 2).map(([id]) => id)

  const outgoing = relational.refs.filter((r) => r.child.tableId === table.id)
  const incoming = relational.refs.filter(
    (r) => r.parent.tableId === table.id && r.child.tableId !== table.id,
  )

  if (outgoing.length === 0 && incoming.length === 0) {
    return (
      <p className="px-4 py-4 text-[13px] leading-relaxed text-ink-2">
        No relations yet. Drag the dot at the end of a row onto another column, or open a column and
        use Add relation.
      </p>
    )
  }

  return (
    <div className="pb-1.5">
      <div className="flex items-center gap-3 px-4 pt-3 pb-1">
        <span className="text-xs font-medium text-ink-2">Highlight</span>
        <Segmented
          label="How far the highlight reaches"
          value={String(depth) as `${FocusDepth}`}
          options={DEPTHS.map((option) => ({
            value: option.value,
            label: (
              <>
                {option.text}
                <SegmentCount>
                  {option.value === '1' ? direct.length : direct.length + twoSteps.length}
                </SegmentCount>
              </>
            ),
          }))}
          onChange={(next) => useUi.getState().setFocusDepth(Number(next) as FocusDepth)}
        />
      </div>

      {outgoing.length > 0 && (
        <Group title="References">
          {outgoing.map((ref) => (
            <RelationRow
              key={ref.id}
              reference={ref}
              direction="out"
              label={titleOf(ref.parent.tableId)}
              targetId={ref.parent.tableId}
            />
          ))}
        </Group>
      )}
      {incoming.length > 0 && (
        <Group title="Referenced by">
          {incoming.map((ref) => (
            <RelationRow
              key={ref.id}
              reference={ref}
              direction="in"
              label={titleOf(ref.child.tableId)}
              targetId={ref.child.tableId}
            />
          ))}
        </Group>
      )}
      {depth === 2 && twoSteps.length > 0 && (
        <Group title="Two steps away">
          <li className="flex flex-wrap gap-1.5 px-2.5 pt-0.5 pb-1">
            {twoSteps.map((id) => (
              <button
                key={id}
                type="button"
                className="rounded-[5px] bg-fill px-1.5 py-0.5 text-[13px] text-ink hover:bg-fill-strong"
                onClick={() => focusTable(id, { focusPanel: true })}
              >
                {titleOf(id)}
              </button>
            ))}
          </li>
        </Group>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-1.5 pt-2.5">
      <h3 className="px-2.5 pb-1 text-xs font-medium text-ink-2">{title}</h3>
      <ul>{children}</ul>
    </section>
  )
}

/** Cardinality from this table's side: orders reference customers n:1, customers see 1:n. */
function cardinality(
  kind: RefModel['kind'],
  direction: 'in' | 'out',
): [short: string, long: string] {
  if (kind === 'one-to-one') return ['1:1', 'one to one']
  if (kind === 'many-to-many') return ['n:m', 'many to many']
  return direction === 'out' ? ['n:1', describeRefKind(kind)] : ['1:n', 'one to many']
}

interface RelationRowProps {
  reference: RefModel
  direction: 'in' | 'out'
  label: string
  targetId: string
}

/** Pointing at a relation lights its line on the diagram; a click moves to the other table. */
function RelationRow({ reference, direction, label, targetId }: RelationRowProps) {
  const [short, long] = cardinality(reference.kind, direction)
  const actions = [
    reference.onDelete && `on delete ${reference.onDelete}`,
    reference.onUpdate && `on update ${reference.onUpdate}`,
  ].filter(Boolean)
  const mine = direction === 'out' ? reference.child.columns : reference.parent.columns
  const theirs = direction === 'out' ? reference.parent.columns : reference.child.columns
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft
  const light = () => setHover({ kind: 'ref', refId: reference.id })
  const unlight = () => setHover(null)

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-fill"
        onPointerEnter={light}
        onPointerLeave={unlight}
        onFocus={light}
        onBlur={unlight}
        onClick={() => focusTable(targetId, { focusPanel: true })}
      >
        <Icon aria-hidden className="mt-[3px] size-3.5 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-2">
            <span className="truncate">{mine.join(', ')}</span>
            <ArrowRight
              role="img"
              aria-label={direction === 'out' ? 'references' : 'is referenced by'}
              className={cn('size-3 shrink-0', direction === 'in' && 'rotate-180')}
            />
            <span className="truncate">{theirs.join(', ')}</span>
          </span>
          {(reference.name || actions.length > 0) && (
            <span className="mt-0.5 block text-[11.5px] text-ink-2">
              {[reference.name, ...actions].filter(Boolean).join(', ')}
            </span>
          )}
        </span>
        <span
          aria-label={long}
          className="mt-px shrink-0 rounded-[4px] px-1.5 py-px font-mono text-[11px] text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]"
        >
          {short}
        </span>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------- indexes and records

function IndexList({ table }: { table: TableModel }) {
  return (
    <ul className="p-1.5">
      {table.indexes.map((index, i) => (
        <li key={i} className="px-2.5 py-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            {index.columns.map((column) => (
              <span
                key={column}
                className="rounded-[4px] bg-fill px-1.5 py-px font-mono text-xs text-ink"
              >
                {column}
              </span>
            ))}
            {index.pk && <Tag>primary key</Tag>}
            {index.unique && <Tag>unique</Tag>}
          </span>
          {(index.name || index.type || index.note) && (
            <span className="mt-1 block text-xs text-ink-2">
              {[index.name, index.type && `using ${index.type}`, index.note]
                .filter(Boolean)
                .join(', ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-[4px] px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
      {children}
    </span>
  )
}

/** Rows declared with `Records`, as a small table that scrolls sideways. */
function SampleRows({ records }: { records: RecordsModel }) {
  return (
    <div className="mx-3 overflow-x-auto rounded-[6px] shadow-[inset_0_0_0_1px_var(--line)]">
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

// ---------------------------------------------------------------- enums

function EnumDetails({ table }: { table: TableModel }) {
  const model = useDiagram((s) => s.model)
  const users = model.refs.filter((r) => r.kind === 'enum' && r.parent.tableId === table.id)
  const titleOf = (id: string) => {
    const other = model.tables.find((t) => t.id === id)
    return other ? tableTitle(other) : id
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pb-1.5">
      <Group title="Values">
        {table.columns.map((value) => (
          <li key={value.name} className="px-2.5 py-1 font-mono text-xs text-ink">
            {value.name}
            {value.note && (
              <span className="mt-0.5 block font-sans text-xs text-ink-2">{value.note}</span>
            )}
          </li>
        ))}
      </Group>
      {users.length > 0 && (
        <Group title="Used by">
          {users.map((ref) => (
            <li key={ref.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-fill"
                onClick={() => focusTable(ref.child.tableId, { focusPanel: true })}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {titleOf(ref.child.tableId)}
                </span>
                <span className="truncate font-mono text-[11.5px] text-ink-2">
                  {ref.child.columns.join(', ')}
                </span>
              </button>
            </li>
          ))}
        </Group>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- footer

/**
 * The two things a table can do that are not about its content: lead to another table, and
 * move without dragging (for anyone who cannot or does not want to drag).
 */
function Footer({ table }: { table: TableModel }) {
  return (
    <footer className="flex items-center gap-0.5 border-t border-line p-1.5">
      <Button
        variant="ghost"
        className="h-8 gap-1.5 px-2! text-xs"
        onClick={() => useUi.getState().openPalette({ kind: 'path', fromId: table.id })}
      >
        <Route aria-hidden className="size-4" />
        Path to another table
      </Button>
      <span className="flex-1" />
      <span className="mr-1 text-xs text-ink-2 max-[400px]:hidden">Move</span>
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
    </footer>
  )
}

interface MoveButtonProps {
  tableId: string
  label: string
  dx: number
  dy: number
  children: ReactNode
}

function MoveButton({ tableId, label, dx, dy, children }: MoveButtonProps) {
  return (
    <IconButton
      label={label}
      tooltipSide="top"
      className="size-7"
      onClick={() => nudgeTable(tableId, dx, dy)}
    >
      {children}
    </IconButton>
  )
}
