import {
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ChevronDown,
  Group,
  Layers,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { usePresence } from '@/lib/usePresence'
import { alignSelection } from '@/app/arrange'
import { groupFromSelection, viewFromSelection } from '@/app/editActions'
import { selectTable, useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { Button, IconButton } from '@/ui/Button'
import { InlineEdit } from '@/ui/InlineEdit'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/Menu'

/**
 * What can be done with several tables at once: arrange them, or write them into the code
 * as a TableGroup or a DiagramView. Shown at the top while two or more are selected.
 */
export function SelectionBar() {
  const size = useDiagram((s) => s.multiSelection.size)
  const readOnly = useUi((s) => s.viewer !== null)
  const [naming, setNaming] = useState<'group' | 'view' | null>(null)
  // The bar keeps the last count while it leaves.
  const { shown: count, leaving } = usePresence(size >= 2 ? size : null, 140)
  if (size < 2 && naming) setNaming(null)
  if (count === null) return null

  return (
    <div
      role="toolbar"
      aria-label="Selected tables"
      data-canvas-interactive
      data-state={leaving ? 'closed' : 'open'}
      inert={leaving}
      className="absolute top-4 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 animate-drop-in items-center gap-0.5 rounded-[10px] bg-surface p-1 shadow-pop data-[state=closed]:animate-lift-out"
    >
      <p aria-live="polite" className="px-2 text-[13px] font-medium whitespace-nowrap text-ink">
        {count} tables
      </p>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      {naming ? (
        <label className="flex h-8 items-center gap-2 px-1.5 text-xs text-ink-2">
          {naming === 'group' ? 'Group name' : 'View name'}
          <InlineEdit
            label={naming === 'group' ? 'Group name' : 'View name'}
            initial=""
            className="h-7 min-w-36 text-[13px]"
            onDone={(value) => {
              setNaming(null)
              const name = value?.trim()
              if (!name) return
              if (naming === 'group') groupFromSelection(name)
              else viewFromSelection(name)
            }}
          />
        </label>
      ) : (
        <>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-1 px-2! text-xs">
                Arrange
                <ChevronDown aria-hidden className="size-3.5 text-ink-3" />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem icon={<AlignStartVertical />} onSelect={() => alignSelection('left')}>
                Align left edges
              </MenuItem>
              <MenuItem icon={<AlignStartHorizontal />} onSelect={() => alignSelection('top')}>
                Align top edges
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<AlignHorizontalSpaceAround />}
                onSelect={() => alignSelection('spread-x')}
              >
                Space out side by side
              </MenuItem>
              <MenuItem
                icon={<AlignVerticalSpaceAround />}
                onSelect={() => alignSelection('spread-y')}
              >
                Space out top to bottom
              </MenuItem>
            </MenuContent>
          </Menu>
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                className="h-8 gap-1.5 px-2! text-xs"
                onClick={() => setNaming('group')}
              >
                <Group aria-hidden className="size-4" />
                Make group
              </Button>
              <Button
                variant="ghost"
                className="h-8 gap-1.5 px-2! text-xs"
                onClick={() => setNaming('view')}
              >
                <Layers aria-hidden className="size-4" />
                Make view
              </Button>
            </>
          )}
        </>
      )}
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Clear selection" shortcut="Esc" onClick={() => selectTable(null)}>
        <X />
      </IconButton>
    </div>
  )
}
