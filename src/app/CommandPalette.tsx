import { Command } from 'cmdk'
import {
  Columns3,
  CornerDownLeft,
  Database,
  FileInput,
  FileText,
  FolderOpen,
  Image,
  KeyRound,
  Keyboard,
  Layers,
  Link2,
  Maximize,
  PanelLeft,
  Plus,
  Save,
  Search,
  Shapes,
  SunMoon,
  Table2,
  Workflow,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { isTable, type ColumnModel, type SchemaModel, type TableModel } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { tableTitle } from '@/layout/geometry'
import {
  fitContent,
  setDetail,
  setPathTarget,
  setView,
  spotlightColumn,
  useDiagram,
} from '@/store/diagram'
import { sortedDocuments, useDocuments } from '@/store/documents'
import { useUi, type PaletteMode } from '@/store/ui'
import { Kbd } from '@/ui/Kbd'
import { arrangeWithUndo, focusTable, newDiagram, toggleTheme } from './actions'
import { DETAIL_LEVELS, SEARCH_LABEL } from './constants'
import { addRelationFromDiagram, type ColumnRef } from './editActions'
import { matchScore } from './search'
import { copyShareLink, exportPng, exportSvg } from './exportActions'
import { openFile, saveFile } from './fileActions'

/** Columns only join the results once the search is specific enough to keep the list short. */
const COLUMN_SEARCH_MIN = 2
const COLUMN_RESULTS_MAX = 40
/** Without a search, the list starts with the best connected tables instead of all of them. */
const TABLES_WITHOUT_QUERY = 6

/** Search for tables and columns and run any action from the keyboard. */
export function CommandPalette() {
  const open = useUi((s) => s.commandOpen)
  const mode = useUi((s) => s.paletteMode)
  const setOpen = useUi((s) => s.setCommandOpen)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40 dark:bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-50 w-[min(580px,calc(100vw-24px))] -translate-x-1/2 animate-pop-in overflow-hidden rounded-panel bg-surface shadow-pop outline-none"
        >
          <Dialog.Title className="sr-only">{titleFor(mode)}</Dialog.Title>
          {mode.kind === 'all' ? (
            <PaletteCommands close={() => setOpen(false)} />
          ) : (
            <Picker mode={mode} close={() => setOpen(false)} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function titleFor(mode: PaletteMode): string {
  if (mode.kind === 'path') return 'Choose the table to find a path to'
  if (mode.kind === 'relation') return 'Choose the column the relation points at'
  return SEARCH_LABEL
}

/** Runs after the dialog closed, so focus lands where the action puts it. */
function runLater(close: () => void, action: () => void): () => void {
  return () => {
    close()
    requestAnimationFrame(action)
  }
}

/** Mounted only while the palette is open, so typing in the editor never re-renders it. */
function PaletteCommands({ close }: { close: () => void }) {
  const model = useDiagram((s) => s.model)
  const fullModel = useDiagram((s) => s.fullModel)
  const view = useDiagram((s) => s.view)
  const documents = useDocuments((s) => s.documents)
  const activeId = useDocuments((s) => s.activeId)
  const [query, setQuery] = useState('')

  const run = (action: () => void) => runLater(close, action)
  const ui = useUi.getState()
  const hasDiagram = activeId !== null
  const searching = query.trim().length > 0
  const groups = new Map(model.groups.map((g) => [g.id, g.name]))
  const others = sortedDocuments(documents).filter((d) => d.id !== activeId)
  const tables = searching ? model.tables.filter(isTable) : hubTables(model)
  const enums = model.tables.filter((t) => t.kind === 'enum')
  const columns = query.trim().length >= COLUMN_SEARCH_MIN ? matchingColumns(model, query) : []

  return (
    <Command loop label={SEARCH_LABEL} filter={matchScore}>
      <SearchRow>
        <Command.Input
          placeholder={hasDiagram ? SEARCH_LABEL : 'Search actions'}
          value={query}
          onValueChange={setQuery}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </SearchRow>
      <Command.List className="max-h-[min(420px,56vh)] overflow-y-auto overscroll-contain p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-2">
          Nothing matches that search.
        </Command.Empty>

        {tables.length > 0 && (
          <Group heading="Tables">
            {tables.map((table) => (
              <Item
                key={table.id}
                value={tableTitle(table)}
                keywords={['table', table.groupId ? (groups.get(table.groupId) ?? '') : '']}
                icon={<Table2 />}
                hint={table.groupId ? groups.get(table.groupId) : undefined}
                onSelect={run(() => focusTable(table.id, { focusPanel: true, zoom: true }))}
              >
                {tableTitle(table)}
              </Item>
            ))}
            {!searching && model.tables.filter(isTable).length > tables.length && (
              <p className="px-2.5 pt-0.5 pb-1 text-xs text-ink-3">
                Most connected first. Type to search all {model.tables.filter(isTable).length}{' '}
                tables and their columns.
              </p>
            )}
          </Group>
        )}

        {columns.length > 0 && (
          <Group heading="Columns">
            {columns.map(({ table, column }) => (
              <Item
                key={`${table.id}.${column.name}`}
                value={`${tableTitle(table)}.${column.name}`}
                keywords={['column', column.type]}
                icon={<Columns3 />}
                hint={column.type}
                onSelect={run(() => {
                  focusTable(table.id, { focusPanel: true, zoom: true })
                  revealInEditor(column.range)
                  spotlightColumn({ tableId: table.id, column: column.name })
                })}
              >
                {`${tableTitle(table)}.${column.name}`}
              </Item>
            ))}
          </Group>
        )}

        {searching && enums.length > 0 && (
          <Group heading="Enums">
            {enums.map((item) => (
              <Item
                key={item.id}
                value={`enum ${tableTitle(item)}`}
                icon={<Shapes />}
                hint={`${item.columns.length} values`}
                onSelect={run(() => focusTable(item.id, { focusPanel: true, zoom: true }))}
              >
                {tableTitle(item)}
              </Item>
            ))}
          </Group>
        )}

        {fullModel.views.length > 0 && (
          <Group heading="Views">
            <Item
              value="All tables"
              keywords={['view']}
              icon={<Layers />}
              hint={view === null ? 'shown' : undefined}
              onSelect={run(() => void setView(null))}
            >
              All tables
            </Item>
            {fullModel.views.map((item) => (
              <Item
                key={item.name}
                value={`view ${item.name}`}
                icon={<Layers />}
                hint={view === item.name ? 'shown' : `${item.tableIds.length} tables`}
                onSelect={run(() => void setView(item.name))}
              >
                {item.name}
              </Item>
            ))}
          </Group>
        )}

        {hasDiagram && (
          <Group heading="Diagram">
            <Item
              icon={<Workflow />}
              shortcut="shift+A"
              onSelect={run(() => void arrangeWithUndo())}
            >
              Tidy up layout
            </Item>
            <Item icon={<Maximize />} shortcut="1" onSelect={run(() => fitContent(true))}>
              Fit diagram to screen
            </Item>
            {DETAIL_LEVELS.map((level) => (
              <Item
                key={level.value}
                value={level.command}
                keywords={['columns', 'detail']}
                icon={<Table2 />}
                onSelect={run(() => void setDetail(level.value))}
              >
                {level.command}
              </Item>
            ))}
            <Item icon={<Image />} onSelect={run(() => void exportPng())}>
              Export as image (PNG)
            </Item>
            <Item icon={<Shapes />} onSelect={run(() => void exportSvg())}>
              Export as vector image (SVG)
            </Item>
            <Item icon={<Database />} onSelect={run(() => ui.openDialog('export-sql'))}>
              Export as SQL script
            </Item>
            <Item icon={<Link2 />} onSelect={run(() => void copyShareLink())}>
              Copy share link
            </Item>
          </Group>
        )}

        <Group heading="App">
          <Item icon={<Plus />} onSelect={run(newDiagram)}>
            New diagram
          </Item>
          <Item icon={<FolderOpen />} shortcut="mod+O" onSelect={run(() => void openFile())}>
            Open DBML file
          </Item>
          {hasDiagram && (
            <Item icon={<Save />} shortcut="mod+S" onSelect={run(() => void saveFile())}>
              Save to file
            </Item>
          )}
          <Item icon={<FileInput />} onSelect={run(() => ui.openImport())}>
            Import from SQL
          </Item>
          {hasDiagram && (
            <Item icon={<PanelLeft />} shortcut="mod+\" onSelect={run(ui.toggleEditor)}>
              Show or hide code
            </Item>
          )}
          <Item icon={<SunMoon />} onSelect={run(toggleTheme)}>
            Switch between light and dark theme
          </Item>
          <Item icon={<Keyboard />} shortcut="?" onSelect={run(() => ui.openDialog('shortcuts'))}>
            Keyboard shortcuts
          </Item>
        </Group>

        {others.length > 0 && (
          <Group heading="Open diagram">
            {others.map((doc) => (
              <Item
                key={doc.id}
                value={`${doc.name} ${doc.id}`}
                keywords={['open', 'diagram']}
                icon={<FileText />}
                onSelect={run(() => useDocuments.getState().open(doc.id))}
              >
                {doc.name}
              </Item>
            ))}
          </Group>
        )}
      </Command.List>
    </Command>
  )
}

/** The tables with the most relations, as a short start list. */
function hubTables(model: SchemaModel): TableModel[] {
  const degree = new Map<string, number>()
  for (const ref of model.refs) {
    if (ref.kind === 'enum') continue
    for (const id of new Set([ref.child.tableId, ref.parent.tableId])) {
      degree.set(id, (degree.get(id) ?? 0) + 1)
    }
  }
  return model.tables
    .filter(isTable)
    .map((table, index) => ({ table, index, degree: degree.get(table.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree || a.index - b.index)
    .slice(0, TABLES_WITHOUT_QUERY)
    .map((entry) => entry.table)
}

/** Columns whose table or name contains every word of the query. */
function matchingColumns(model: SchemaModel, query: string) {
  const results: { table: TableModel; column: ColumnModel }[] = []
  for (const table of model.tables) {
    if (!isTable(table)) continue
    for (const column of table.columns) {
      const value = `${tableTitle(table)}.${column.name}`
      if (matchScore(value, query, [column.type]) > 0) results.push({ table, column })
      if (results.length >= COLUMN_RESULTS_MAX) return results
    }
  }
  return results
}

/** The palette narrowed to one question: which table, or which column? */
function Picker({
  mode,
  close,
}: {
  mode: Exclude<PaletteMode, { kind: 'all' }>
  close: () => void
}) {
  const model = useDiagram((s) => s.model)
  const tables = model.tables.filter(isTable)
  const run = (action: () => void) => runLater(close, action)
  const nameOf = (id: string) => {
    const table = model.tables.find((t) => t.id === id)
    return table ? tableTitle(table) : id
  }

  if (mode.kind === 'path') {
    return (
      <Command loop label={titleFor(mode)} filter={matchScore}>
        <PickerHeader>Path from {nameOf(mode.fromId)} to</PickerHeader>
        <Command.List className="max-h-[min(420px,56vh)] overflow-y-auto overscroll-contain p-1.5">
          <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-2">
            No table matches that search.
          </Command.Empty>
          {tables
            .filter((t) => t.id !== mode.fromId)
            .map((table) => (
              <Item
                key={table.id}
                value={tableTitle(table)}
                icon={<Table2 />}
                onSelect={run(() => setPathTarget(table.id))}
              >
                {tableTitle(table)}
              </Item>
            ))}
        </Command.List>
      </Command>
    )
  }

  const from: ColumnRef = mode.from
  const source = model.tables
    .find((t) => t.id === from.tableId)
    ?.columns.find((c) => c.name === from.column)
  const targets = relationTargets(tables, from, source)

  return (
    <Command loop label={titleFor(mode)} filter={matchScore}>
      <PickerHeader>
        Relation from {nameOf(from.tableId)}.{from.column} to
      </PickerHeader>
      <Command.List className="max-h-[min(420px,56vh)] overflow-y-auto overscroll-contain p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-2">
          No column matches that search.
        </Command.Empty>
        {targets.map(({ heading, items }) =>
          items.length === 0 ? null : (
            <Group key={heading} heading={heading}>
              {items.map(({ table, column }) => (
                <Item
                  key={`${table.id}.${column.name}`}
                  value={`${tableTitle(table)}.${column.name}`}
                  keywords={[column.type]}
                  icon={column.pk || column.unique ? <KeyRound /> : <Columns3 />}
                  hint={column.type}
                  onSelect={run(() =>
                    addRelationFromDiagram(from, { tableId: table.id, column: column.name }),
                  )}
                >
                  {`${tableTitle(table)}.${column.name}`}
                </Item>
              ))}
            </Group>
          ),
        )}
      </Command.List>
    </Command>
  )
}

/**
 * Columns a relation can point at, best first: keys of the same type, other keys, then the
 * rest. The table the relation starts from is left out; a self reference is rare enough to
 * write in the code.
 */
function relationTargets(tables: TableModel[], from: ColumnRef, source: ColumnModel | undefined) {
  const sameType = (column: ColumnModel) =>
    source !== undefined && column.type.toLowerCase() === source.type.toLowerCase()
  const keys: { table: TableModel; column: ColumnModel; rank: number }[] = []
  const rest: { table: TableModel; column: ColumnModel }[] = []
  for (const table of tables) {
    if (table.id === from.tableId) continue
    for (const column of table.columns) {
      if (column.pk || column.unique) keys.push({ table, column, rank: sameType(column) ? 0 : 1 })
      else rest.push({ table, column })
    }
  }
  keys.sort((a, b) => a.rank - b.rank)
  return [
    { heading: 'Keys', items: keys },
    { heading: 'Other columns', items: rest },
  ]
}

function SearchRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-2.5 border-b border-line pr-3 pl-4">
      <Search aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
      {children}
      {/* A hint for keyboards; touch screens close the palette by tapping outside. */}
      <Kbd shortcut="Esc" className="pointer-coarse:hidden" />
    </div>
  )
}

function PickerHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-line">
      <p className="px-4 pt-3 text-xs font-medium text-ink-3">{children}</p>
      <div className="flex h-11 items-center gap-2.5 pr-3 pl-4">
        <Search aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <Command.Input
          autoFocus
          placeholder="Type to filter"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <Kbd shortcut="Esc" className="pointer-coarse:hidden" />
      </div>
    </div>
  )
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3"
    >
      {children}
    </Command.Group>
  )
}

interface ItemProps {
  value?: string
  keywords?: string[]
  icon: ReactNode
  hint?: string
  shortcut?: string
  onSelect: () => void
  children: string
}

function Item({ value, keywords, icon, hint, shortcut, onSelect, children }: ItemProps) {
  return (
    <Command.Item
      value={value ?? children}
      keywords={keywords?.filter(Boolean)}
      onSelect={onSelect}
      className="group/item flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 text-[13px] text-ink select-none data-[selected=true]:bg-fill-strong [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {/* The selected row is darker, so its hint steps up a grey to keep 4.5:1. */}
      {hint && (
        <span className="max-w-[45%] truncate text-xs text-ink-3 group-data-[selected=true]/item:text-ink-2">
          {hint}
        </span>
      )}
      {shortcut && <Kbd plain tone="muted" shortcut={shortcut} />}
      {/* Marks the row Enter will run. Always takes its space, so rows do not jump. */}
      <CornerDownLeft
        aria-hidden
        className="opacity-0 group-data-[selected=true]/item:opacity-100"
      />
    </Command.Item>
  )
}
