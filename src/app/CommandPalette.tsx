import { Command } from 'cmdk'
import {
  CornerDownLeft,
  Database,
  FileInput,
  FileText,
  Image,
  Keyboard,
  Link2,
  Maximize,
  PanelLeft,
  Plus,
  Shapes,
  Sparkles,
  SunMoon,
  Table2,
} from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { SAMPLES } from '@/dbml/samples'
import { tableTitle } from '@/layout/geometry'
import { shortcutLabel } from '@/lib/platform'
import { fitContent, setDetail, useDiagram } from '@/store/diagram'
import { sortedDocuments, useDocuments } from '@/store/documents'
import { useUi } from '@/store/ui'
import { arrangeWithUndo, focusTable, newDiagram, openSample, toggleTheme } from './actions'
import { DETAIL_LEVELS } from './constants'
import { copyShareLink, exportPng, exportSvg } from './exportActions'

/** Search for tables and run any action from the keyboard. */
export function CommandPalette() {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40 dark:bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-50 w-[min(580px,calc(100vw-24px))] -translate-x-1/2 animate-pop-in overflow-hidden rounded-panel bg-surface shadow-pop outline-none"
        >
          <Dialog.Title className="sr-only">Search tables and actions</Dialog.Title>
          <PaletteCommands close={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Mounted only while the palette is open, so typing in the editor never re-renders it. */
function PaletteCommands({ close }: { close: () => void }) {
  const model = useDiagram((s) => s.model)
  const documents = useDocuments((s) => s.documents)
  const activeId = useDocuments((s) => s.activeId)

  const run = (action: () => void) => () => {
    close()
    // Let the dialog hand focus back before the action moves it elsewhere.
    requestAnimationFrame(action)
  }
  const ui = useUi.getState()
  const groups = new Map(model.groups.map((g) => [g.id, g.name]))
  const others = sortedDocuments(documents).filter((d) => d.id !== activeId)

  return (
    <Command loop label="Search tables and actions">
      <Command.Input
        placeholder="Search tables and actions"
        className="h-12 w-full border-b border-line bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-3"
      />
      <Command.List className="max-h-[min(420px,56vh)] overflow-y-auto overscroll-contain p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-2">
          Nothing matches that search.
        </Command.Empty>

        {model.tables.length > 0 && (
          <Group heading="Tables">
            {model.tables.map((table) => (
              <Item
                key={table.id}
                value={`table ${tableTitle(table)}`}
                icon={<Table2 />}
                hint={table.groupId ? groups.get(table.groupId) : undefined}
                onSelect={run(() => focusTable(table.id, { focusPanel: true }))}
              >
                {tableTitle(table)}
              </Item>
            ))}
          </Group>
        )}

        <Group heading="Diagram">
          <Item icon={<Sparkles />} shortcut="shift+A" onSelect={run(() => void arrangeWithUndo())}>
            Tidy up layout
          </Item>
          <Item icon={<Maximize />} shortcut="1" onSelect={run(() => fitContent(true))}>
            Fit diagram to screen
          </Item>
          {DETAIL_LEVELS.map((level) => (
            <Item
              key={level.value}
              value={`show columns ${level.label}`}
              icon={<Table2 />}
              onSelect={run(() => void setDetail(level.value))}
            >
              {`Show ${level.label.toLowerCase()}`}
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

        <Group heading="App">
          <Item icon={<Plus />} onSelect={run(newDiagram)}>
            New diagram
          </Item>
          <Item icon={<FileInput />} onSelect={run(() => ui.openDialog('import-sql'))}>
            Import from SQL
          </Item>
          <Item icon={<PanelLeft />} shortcut="mod+\" onSelect={run(ui.toggleEditor)}>
            Show or hide code
          </Item>
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
                value={`open diagram ${doc.name} ${doc.id}`}
                icon={<FileText />}
                onSelect={run(() => useDocuments.getState().open(doc.id))}
              >
                {doc.name}
              </Item>
            ))}
          </Group>
        )}

        <Group heading="Examples">
          {SAMPLES.map((sample) => (
            <Item
              key={sample.id}
              value={`example ${sample.name}`}
              icon={<FileText />}
              hint={sample.description}
              onSelect={run(() => openSample(sample))}
            >
              {sample.name}
            </Item>
          ))}
        </Group>
      </Command.List>
    </Command>
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
  icon: ReactNode
  hint?: string
  shortcut?: string
  onSelect: () => void
  children: string
}

function Item({ value, icon, hint, shortcut, onSelect, children }: ItemProps) {
  return (
    <Command.Item
      value={value ?? children}
      onSelect={onSelect}
      className="group/item flex h-9 cursor-default items-center gap-2.5 rounded-control px-2.5 text-[13px] text-ink select-none data-[selected=true]:bg-fill-strong [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="max-w-[45%] truncate text-xs text-ink-3">{hint}</span>}
      {shortcut && (
        <kbd className="font-mono text-[11px] text-ink-3">{shortcutLabel(shortcut)}</kbd>
      )}
      {/* Marks the row Enter will run. Always takes its space, so rows do not jump. */}
      <CornerDownLeft
        aria-hidden
        className="opacity-0 group-data-[selected=true]/item:opacity-100"
      />
    </Command.Item>
  )
}
