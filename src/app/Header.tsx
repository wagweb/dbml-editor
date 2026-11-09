import {
  Code2,
  Database,
  Download,
  FileCode2,
  Image,
  Keyboard,
  Link2,
  PanelLeft,
  Search,
  Shapes,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react'
import type { DetailLevel } from '@/layout/geometry'
import { useUi, type ThemePreference } from '@/store/ui'
import { Button, IconButton } from '@/ui/Button'
import { Kbd } from '@/ui/Kbd'
import { setDetail, useDiagram } from '@/store/diagram'
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/ui/Menu'
import { APP_NAME, DETAIL_LEVELS } from './constants'
import { DocumentMenu } from './DocumentMenu'
import { copyShareLink, exportDbml, exportPng, exportSvg } from './exportActions'
import { Logo } from './Logo'

export function Header({ mobile }: { mobile: boolean }) {
  const theme = useUi((s) => s.theme)
  const editorOpen = useUi((s) => s.editorOpen)
  const mobileView = useUi((s) => s.mobileView)
  const detail = useDiagram((s) => s.detail)
  const minimapOpen = useUi((s) => s.minimapOpen)
  const showEnums = useUi((s) => s.showEnums)
  const suggestGroups = useUi((s) => s.suggestGroups)
  const showHints = useUi((s) => s.showHints)
  const { toggleEditor, setCommandOpen, openDialog, setMobileView, setTheme } = useUi.getState()

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      {mobile ? (
        <IconButton
          label={mobileView === 'code' ? 'Show diagram' : 'Show code'}
          tooltipSide="bottom"
          onClick={() => setMobileView(mobileView === 'code' ? 'diagram' : 'code')}
        >
          {mobileView === 'code' ? <Workflow /> : <Code2 />}
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
      )}

      <div className="flex items-center gap-2 pr-1 pl-1.5 select-none max-sm:hidden">
        <Logo className="size-[22px]" />
        <span className="text-sm font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </div>
      <span aria-hidden className="px-0.5 text-lg font-light text-line-strong max-sm:hidden">
        /
      </span>
      <DocumentMenu />

      <div className="flex-1" />

      {/* Looks like a field, opens the search palette. */}
      <button
        type="button"
        className="mr-1 flex h-8 w-64 cursor-text items-center gap-2 rounded-control bg-fill pr-1.5 pl-2.5 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_var(--line)] transition-[color,box-shadow] duration-100 hover:text-ink-2 hover:shadow-[inset_0_0_0_1px_var(--line-strong)] max-lg:hidden"
        onClick={() => setCommandOpen(true)}
      >
        <Search aria-hidden className="size-[15px] shrink-0" strokeWidth={1.75} />
        {/* Trimmed to cap height: the label is centred on its letters, not on its line box. */}
        <span className="flex-1 text-left whitespace-nowrap [text-box:trim-both_cap_alphabetic]">
          Search tables and actions
        </span>
        <Kbd shortcut="mod+K" />
      </button>
      <IconButton
        label="Search tables and actions"
        shortcut="mod+K"
        tooltipSide="bottom"
        className="lg:hidden"
        onClick={() => setCommandOpen(true)}
      >
        <Search />
      </IconButton>

      <Menu>
        <MenuTrigger asChild>
          <IconButton label="View" tooltipSide="bottom">
            <SlidersHorizontal />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>Theme</MenuLabel>
          <MenuRadioGroup value={theme} onValueChange={(next) => setTheme(next as ThemePreference)}>
            <MenuRadioItem value="system">Match system</MenuRadioItem>
            <MenuRadioItem value="light">Light</MenuRadioItem>
            <MenuRadioItem value="dark">Dark</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuLabel>Columns shown</MenuLabel>
          <MenuRadioGroup
            value={detail}
            onValueChange={(next) => void setDetail(next as DetailLevel)}
          >
            {DETAIL_LEVELS.map((level) => (
              <MenuRadioItem key={level.value} value={level.value}>
                {level.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuCheckItem
            checked={showEnums}
            onCheckedChange={(next) => useUi.getState().setShowEnums(next === true)}
          >
            Enums as cards
          </MenuCheckItem>
          <MenuCheckItem
            checked={suggestGroups}
            onCheckedChange={(next) => useUi.getState().setSuggestGroups(next === true)}
          >
            Suggest groups
          </MenuCheckItem>
          <MenuCheckItem
            checked={showHints}
            onCheckedChange={(next) => useUi.getState().setShowHints(next === true)}
          >
            Schema hints
          </MenuCheckItem>
          <MenuCheckItem
            checked={minimapOpen}
            onCheckedChange={() => useUi.getState().toggleMinimap()}
            className="max-md:hidden"
          >
            Overview map
          </MenuCheckItem>
          <MenuSeparator />
          <MenuItem icon={<Keyboard />} shortcut="?" onSelect={() => openDialog('shortcuts')}>
            Keyboard shortcuts
          </MenuItem>
        </MenuContent>
      </Menu>

      <Button variant="ghost" className="max-sm:hidden" onClick={() => void copyShareLink()}>
        <Link2 aria-hidden className="size-4" />
        Share
      </Button>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="primary">
            <Download aria-hidden className="size-4" />
            Export
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
    </header>
  )
}
