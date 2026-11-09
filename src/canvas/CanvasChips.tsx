import { ChevronDown, Group, Layers } from 'lucide-react'
import { keepSuggestedGroups } from '@/app/editActions'
import { isTable } from '@/dbml/model'
import { setView, useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/ui/Menu'

const CHIP =
  'flex h-8 max-w-64 items-center gap-1.5 rounded-[10px] bg-surface pr-2 pl-2.5 text-[13px] font-medium text-ink shadow-pop hover:bg-fill data-[state=open]:bg-fill [&_svg]:size-4 [&_svg]:shrink-0'

/** Controls that only appear when the schema gives a reason: views and suggested groups. */
export function CanvasChips() {
  const views = useDiagram((s) => s.fullModel.views)
  const suggested = useDiagram((s) => s.model.groups.filter((g) => g.suggested).length)
  if (views.length === 0 && suggested === 0) return null

  return (
    <div
      data-canvas-interactive
      className="absolute top-4 left-4 z-10 flex max-w-[calc(100%-32px)] flex-wrap gap-2"
    >
      {views.length > 0 && <ViewSwitcher />}
      {suggested > 0 && <SuggestedGroupsMenu count={suggested} />}
    </div>
  )
}

/** Picks a DiagramView from the code, or the whole diagram. */
function ViewSwitcher() {
  const views = useDiagram((s) => s.fullModel.views)
  const view = useDiagram((s) => s.view)
  const total = useDiagram((s) => s.fullModel.tables.filter(isTable).length)
  // A view that was renamed or removed in the code falls back to everything.
  const current = views.find((v) => v.name === view)

  return (
    <Menu>
      <MenuTrigger className={CHIP} aria-label={`View: ${current ? current.name : 'All tables'}`}>
        <Layers aria-hidden className="text-ink-2" />
        <span className="truncate">{current ? current.name : 'All tables'}</span>
        <ChevronDown aria-hidden className="text-ink-3" />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>Views</MenuLabel>
        <MenuRadioGroup
          value={current ? current.name : ''}
          onValueChange={(next) => void setView(next === '' ? null : next)}
        >
          <MenuRadioItem value="" hint={`${total} tables`}>
            All tables
          </MenuRadioItem>
          {views.map((item) => (
            <MenuRadioItem
              key={item.name}
              value={item.name}
              hint={`${item.tableIds.length} tables`}
            >
              {item.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  )
}

/** Groups the app found on its own: keep them in the code, or stop suggesting. */
function SuggestedGroupsMenu({ count }: { count: number }) {
  const readOnly = useUi((s) => s.viewer !== null)
  return (
    <Menu>
      <MenuTrigger className={CHIP}>
        <Group aria-hidden className="text-ink-2" />
        <span className="truncate">
          {count} suggested {count === 1 ? 'group' : 'groups'}
        </span>
        <ChevronDown aria-hidden className="text-ink-3" />
      </MenuTrigger>
      <MenuContent align="start" className="w-72">
        <p className="px-2 pt-1.5 pb-2 text-xs leading-relaxed text-ink-2">
          Tables that reference each other a lot are outlined as groups. Nothing in the code has
          changed.
        </p>
        <MenuSeparator />
        {!readOnly && (
          <MenuItem onSelect={() => keepSuggestedGroups()}>Add groups to the code</MenuItem>
        )}
        <MenuItem onSelect={() => useUi.getState().setSuggestGroups(false)}>
          Stop suggesting groups
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
