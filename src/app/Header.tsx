import {
  Braces,
  Check,
  Code2,
  Database,
  Download,
  Eye,
  FileCode2,
  FileText,
  Image,
  IndentIncrease,
  Keyboard,
  Link2,
  ListChecks,
  Network,
  PanelLeft,
  Presentation,
  Search,
  Shapes,
  SlidersHorizontal,
  SunMoon,
  Workflow,
} from 'lucide-react'
import type { IndentStyle } from '@/dbml/format'
import type { LayoutPreferences } from '@/layout/elk'
import { activeDocument, useDocuments } from '@/store/documents'
import { useFlash } from '@/lib/useFlash'
import { useUi, type ThemePreference } from '@/store/ui'
import { Button, IconButton } from '@/ui/Button'
import { Kbd } from '@/ui/Kbd'
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/ui/Menu'
import { APP_NAME, SEARCH_LABEL } from './constants'
import { DocumentMenu } from './DocumentMenu'
import { editSharedDiagram } from './actions'
import { describeIndent, formatCode, indentFor, setIndentation } from './codeActions'
import { copyMermaid, copyShareLink, exportDbml, exportMarkdown } from './exportActions'
import { startPresenting } from './present'
import { Logo } from './Logo'

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const INDENT_SIZES = [2, 3, 4, 8] as const

interface HeaderProps {
  mobile: boolean
  hasDocument: boolean
  /** A diagram from a view-only link: no code, no document menu, a way to edit a copy. */
  viewOnly: boolean
}

export function Header({ mobile, hasDocument, viewOnly }: HeaderProps) {
  const editorOpen = useUi((s) => s.editorOpen)
  const mobileView = useUi((s) => s.mobileView)
  const { toggleEditor, setCommandOpen, setMobileView } = useUi.getState()

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel pr-4 pl-2">
      {hasDocument &&
        !viewOnly &&
        (mobile ? (
          <IconButton
            label={mobileView === 'code' ? 'Show diagram' : 'Show code'}
            tooltipSide="bottom"
            onClick={() => setMobileView(mobileView === 'code' ? 'diagram' : 'code')}
          >
            {mobileView === 'code' ? <Network /> : <Code2 />}
          </IconButton>
        ) : (
          <IconButton
            // The name stays the same; the pressed state says whether the panel is open.
            label="Code panel"
            shortcut="mod+\"
            tooltipSide="bottom"
            aria-pressed={editorOpen}
            onClick={toggleEditor}
          >
            <PanelLeft />
          </IconButton>
        ))}

      <div
        className={`flex items-center gap-2 pr-1 select-none ${hasDocument ? 'pl-1.5 max-sm:hidden' : 'pl-2'}`}
      >
        <Logo className="size-[22px]" />
        <span className="text-sm font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </div>
      {hasDocument && (
        <>
          <span aria-hidden className="pl-1 text-lg font-light text-line-strong max-sm:hidden">
            /
          </span>
          {viewOnly ? <SharedTitle /> : <DocumentMenu />}
        </>
      )}

      <div className="flex-1" />

      {/*
        Spacing goes by what the eye sees. Ghost buttons carry 8 px of invisible padding,
        filled controls none: ghosts sit 2 px apart, filled ones 10 px from their
        neighbours, so every visible edge or icon is 18 px from the next.
      */}
      <div className="flex items-center gap-2.5">
        {/* Looks like a field, opens the search palette. */}
        <button
          type="button"
          aria-keyshortcuts="Meta+K Control+K"
          className="flex h-8 w-56 cursor-text items-center gap-2 rounded-control bg-fill pr-1.5 pl-2.5 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] transition-[color,box-shadow] duration-100 hover:text-ink-2 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] max-lg:hidden"
          onClick={() => setCommandOpen(true)}
        >
          <Search aria-hidden className="size-[15px] shrink-0" strokeWidth={1.75} />
          {/* Trimmed to cap height: the label is centred on its letters, not on its line box. */}
          <span className="flex-1 text-left whitespace-nowrap [text-box:trim-both_cap_alphabetic]">
            Search<span className="sr-only"> tables, columns and actions</span>
          </span>
          <span aria-hidden>
            <Kbd shortcut="mod+K" />
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          <IconButton
            label={SEARCH_LABEL}
            shortcut="mod+K"
            tooltipSide="bottom"
            className="lg:hidden"
            onClick={() => setCommandOpen(true)}
          >
            <Search />
          </IconButton>
          <ViewMenu hasDocument={hasDocument} viewOnly={viewOnly} />
          {hasDocument && viewOnly && (
            <Button variant="ghost" className="px-2! max-sm:hidden" onClick={startPresenting}>
              <Presentation aria-hidden className="size-4" />
              Present
            </Button>
          )}
          {hasDocument && !viewOnly && <ShareButton />}
        </div>

        {hasDocument && viewOnly && (
          <>
            <ExportMenu variant="secondary" />
            <Button variant="primary" onClick={editSharedDiagram}>
              Open in editor
            </Button>
          </>
        )}
        {hasDocument && !viewOnly && <ExportMenu variant="primary" />}
      </div>
    </header>
  )
}

/** Copies the link; the button itself confirms it for a moment. */
function ShareButton() {
  const [copied, flash] = useFlash()
  return (
    <Button
      variant="ghost"
      className="px-2! max-sm:hidden"
      onClick={() => void copyShareLink().then((ok) => ok && flash())}
    >
      {copied ? (
        <Check aria-hidden className="size-4 animate-pop-in text-ok" />
      ) : (
        <Link2 aria-hidden className="size-4" />
      )}
      Share
    </Button>
  )
}

/** The name of a diagram from a view-only link, and that it is one. */
function SharedTitle() {
  const name = useUi((s) => s.viewer?.name ?? '')
  return (
    <div className="flex min-w-0 items-center gap-2 px-1">
      <span className="truncate text-[13px] font-medium text-ink">{name}</span>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-xs font-medium text-ink-2">
        <Eye aria-hidden className="size-3.5" />
        View only
      </span>
    </div>
  )
}

/**
 * Options for how the diagram is drawn, the code's formatting, and the theme. The column
 * detail lives in the toolbar.
 */
function ViewMenu({ hasDocument, viewOnly }: { hasDocument: boolean; viewOnly: boolean }) {
  const theme = useUi((s) => s.theme)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const showEnums = useUi((s) => s.showEnums)
  const suggestGroups = useUi((s) => s.suggestGroups)
  const showHints = useUi((s) => s.showHints)
  const wrapLines = useUi((s) => s.wrapLines)
  const ui = useUi.getState()

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label="View options" tooltipSide="bottom">
          <SlidersHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="w-60">
        {hasDocument && (
          <>
            <MenuLabel>Diagram</MenuLabel>
            <MenuCheckItem
              checked={showEnums}
              onCheckedChange={(next) => ui.setShowEnums(next === true)}
            >
              Enums as cards
            </MenuCheckItem>
            <MenuCheckItem
              checked={suggestGroups}
              onCheckedChange={(next) => ui.setSuggestGroups(next === true)}
            >
              Suggest groups
            </MenuCheckItem>
            <MenuCheckItem
              checked={showHints}
              onCheckedChange={(next) => ui.setShowHints(next === true)}
            >
              Schema hints
            </MenuCheckItem>
            {!viewOnly && (
              <MenuItem icon={<ListChecks />} onSelect={() => ui.openDialog('hint-rules')}>
                Hint rules
              </MenuItem>
            )}
            <MenuCheckItem
              checked={minimapOpen}
              onCheckedChange={() => ui.toggleMinimap()}
              className="max-md:hidden"
            >
              Overview map
            </MenuCheckItem>
            <LayoutMenu />
            <MenuItem icon={<Presentation />} shortcut="P" onSelect={startPresenting}>
              Present
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        {hasDocument && !viewOnly && (
          <>
            <MenuLabel>Code</MenuLabel>
            <MenuItem icon={<Braces />} shortcut="shift+alt+F" onSelect={() => void formatCode()}>
              Format code
            </MenuItem>
            <IndentationMenu />
            <MenuCheckItem
              checked={wrapLines}
              onCheckedChange={(next) => ui.setWrapLines(next === true)}
            >
              Wrap long lines
            </MenuCheckItem>
            <MenuSeparator />
          </>
        )}
        <MenuSub>
          <MenuSubTrigger icon={<SunMoon />} hint={THEMES.find((t) => t.value === theme)?.label}>
            Theme
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuRadioGroup
              value={theme}
              onValueChange={(next) => ui.setTheme(next as ThemePreference)}
            >
              {THEMES.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubContent>
        </MenuSub>
        <MenuItem icon={<Keyboard />} shortcut="?" onSelect={() => ui.openDialog('shortcuts')}>
          Keyboard shortcuts
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

const DIRECTIONS: { value: LayoutPreferences['direction']; label: string }[] = [
  { value: 'right', label: 'Left to right' },
  { value: 'down', label: 'Top to bottom' },
]
const SPACINGS: { value: LayoutPreferences['spacing']; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'airy', label: 'Airy' },
]

/** How the automatic layout arranges the tables; a change lays the diagram out afresh. */
function LayoutMenu() {
  const layout = useUi((s) => s.layout)
  const set = useUi.getState().setLayout
  const direction = DIRECTIONS.find((d) => d.value === layout.direction)?.label
  return (
    <MenuSub>
      <MenuSubTrigger icon={<Workflow />} hint={direction}>
        Layout
      </MenuSubTrigger>
      <MenuSubContent className="w-56">
        <MenuLabel>Direction</MenuLabel>
        <MenuRadioGroup
          value={layout.direction}
          onValueChange={(next) => set({ direction: next as LayoutPreferences['direction'] })}
        >
          {DIRECTIONS.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>Spacing</MenuLabel>
        <MenuRadioGroup
          value={layout.spacing}
          onValueChange={(next) => set({ spacing: next as LayoutPreferences['spacing'] })}
        >
          {SPACINGS.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuCheckItem
          checked={layout.enumsNearUsers}
          onCheckedChange={(next) => set({ enumsNearUsers: next === true })}
        >
          Enums next to their table
        </MenuCheckItem>
      </MenuSubContent>
    </MenuSub>
  )
}

/** Spaces or tabs, and how wide, for the open diagram and every new one. */
function IndentationMenu() {
  const own = useDocuments((s) => (s.activeId ? s.documents[s.activeId]?.indent : undefined))
  const fallback = useUi((s) => s.indent)
  const indent: IndentStyle = own ?? fallback
  const change = (next: Partial<IndentStyle>) =>
    setIndentation({ ...indentFor(activeDocument()), ...next })

  return (
    <MenuSub>
      <MenuSubTrigger icon={<IndentIncrease />} hint={describeIndent(indent)}>
        Indentation
      </MenuSubTrigger>
      <MenuSubContent>
        <MenuRadioGroup
          value={indent.kind}
          onValueChange={(kind) => change({ kind: kind as IndentStyle['kind'] })}
        >
          <MenuRadioItem value="space">Spaces</MenuRadioItem>
          <MenuRadioItem value="tab">Tabs</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>{indent.kind === 'tab' ? 'Tab width' : 'Spaces per level'}</MenuLabel>
        <MenuRadioGroup
          value={String(indent.size)}
          onValueChange={(size) => change({ size: Number(size) })}
        >
          {INDENT_SIZES.map((size) => (
            <MenuRadioItem key={size} value={String(size)}>
              {size}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubContent>
    </MenuSub>
  )
}

/** Image exports go through a dialog for resolution, colours and background. */
function openImageExport(format: 'png' | 'svg') {
  const ui = useUi.getState()
  ui.setImageExport({ format })
  ui.openDialog('export-image')
}

function ExportMenu({ variant }: { variant: 'primary' | 'secondary' }) {
  const { openDialog } = useUi.getState()
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant}>
          <Download aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Export</span>
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-64">
        <MenuItem icon={<Image />} hint="PNG" onSelect={() => openImageExport('png')}>
          Image
        </MenuItem>
        <MenuItem icon={<Shapes />} hint="SVG" onSelect={() => openImageExport('svg')}>
          Vector image
        </MenuItem>
        <MenuItem icon={<Database />} onSelect={() => openDialog('export-sql')}>
          SQL script
        </MenuItem>
        <MenuItem icon={<FileCode2 />} hint=".dbml" onSelect={exportDbml}>
          DBML file
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>For documentation</MenuLabel>
        <MenuItem icon={<FileText />} hint=".md" onSelect={exportMarkdown}>
          Markdown document
        </MenuItem>
        <MenuItem icon={<Network />} hint="Copy" onSelect={() => void copyMermaid()}>
          Mermaid diagram
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Link2 />} onSelect={() => void copyShareLink()}>
          Copy share link
        </MenuItem>
        <MenuItem icon={<Eye />} onSelect={() => void copyShareLink({ viewOnly: true })}>
          Copy view-only link
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
