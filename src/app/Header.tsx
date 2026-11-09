import {
  Code2,
  Database,
  Download,
  FileCode2,
  Image,
  Keyboard,
  Link2,
  Network,
  PanelLeft,
  Search,
  Shapes,
  SlidersHorizontal,
  SunMoon,
} from 'lucide-react'
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
import { copyShareLink, exportDbml, exportPng, exportSvg } from './exportActions'
import { Logo } from './Logo'

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function Header({ mobile, hasDocument }: { mobile: boolean; hasDocument: boolean }) {
  const editorOpen = useUi((s) => s.editorOpen)
  const mobileView = useUi((s) => s.mobileView)
  const { toggleEditor, setCommandOpen, setMobileView } = useUi.getState()

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      {hasDocument &&
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
          <span aria-hidden className="px-0.5 text-lg font-light text-line-strong max-sm:hidden">
            /
          </span>
          <DocumentMenu />
        </>
      )}

      <div className="flex-1" />

      {/* Looks like a field, opens the search palette. */}
      <button
        type="button"
        aria-keyshortcuts="Meta+K Control+K"
        className="mr-1 flex h-8 w-56 cursor-text items-center gap-2 rounded-control bg-fill pr-1.5 pl-2.5 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] transition-[color,box-shadow] duration-100 hover:text-ink-2 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] max-lg:hidden"
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
      <IconButton
        label={SEARCH_LABEL}
        shortcut="mod+K"
        tooltipSide="bottom"
        className="lg:hidden"
        onClick={() => setCommandOpen(true)}
      >
        <Search />
      </IconButton>

      <ViewMenu hasDocument={hasDocument} />

      {hasDocument && (
        <>
          <Button variant="ghost" className="max-sm:hidden" onClick={() => void copyShareLink()}>
            <Link2 aria-hidden className="size-4" />
            Share
          </Button>
          <ExportMenu />
        </>
      )}
    </header>
  )
}

/** Options for how the diagram is drawn, plus the theme. The column detail lives in the toolbar. */
function ViewMenu({ hasDocument }: { hasDocument: boolean }) {
  const theme = useUi((s) => s.theme)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const showEnums = useUi((s) => s.showEnums)
  const suggestGroups = useUi((s) => s.suggestGroups)
  const showHints = useUi((s) => s.showHints)
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
            <MenuCheckItem
              checked={minimapOpen}
              onCheckedChange={() => ui.toggleMinimap()}
              className="max-md:hidden"
            >
              Overview map
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

function ExportMenu() {
  const { openDialog } = useUi.getState()
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="primary">
          <Download aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Export</span>
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon={<Image />} hint="PNG" onSelect={() => void exportPng()}>
          Image
        </MenuItem>
        <MenuItem icon={<Shapes />} hint="SVG" onSelect={() => void exportSvg()}>
          Vector image
        </MenuItem>
        <MenuItem icon={<Database />} onSelect={() => openDialog('export-sql')}>
          SQL script
        </MenuItem>
        <MenuItem icon={<FileCode2 />} hint=".dbml" onSelect={exportDbml}>
          DBML file
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Link2 />} onSelect={() => void copyShareLink()}>
          Copy share link
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
