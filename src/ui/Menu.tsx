import { Check, ChevronRight } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Kbd } from './Kbd'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger
export const MenuRadioGroup = DropdownMenu.RadioGroup
export const MenuSub = DropdownMenu.Sub

/**
 * The row under the pointer or the arrow keys gets a quiet fill. Keyboard users
 * additionally get the app's accent ring, drawn all the way round the row. Its corners are
 * concentric with the menu's: 12 px outside, 4 px padding, so 8 px for the row.
 */
const ITEM =
  'flex min-h-8 cursor-default items-center gap-2.5 rounded-[8px] px-2 text-[13px] outline-hidden select-none data-disabled:opacity-40 data-highlighted:bg-fill-strong keyboard:data-highlighted:shadow-[inset_0_0_0_1.5px_var(--accent)] [&_svg]:size-4 [&_svg]:shrink-0'

/**
 * The outline of a floating surface is a ring drawn outside its box (`--shadow-pop`). The
 * align offset moves the box inward by that ring, so the visible edge of a menu lines up
 * with the edge of its button: left with left for `start`, right with right for `end`.
 */
export const RING_ALIGN_OFFSET = 1

export function MenuContent({
  className,
  sideOffset = 6,
  alignOffset = RING_ALIGN_OFFSET,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={8}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop-in overflow-y-auto rounded-panel bg-surface p-1 shadow-pop data-[state=closed]:animate-pop-out',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

interface MenuItemProps extends ComponentProps<typeof DropdownMenu.Item> {
  icon?: ReactNode
  shortcut?: string
  hint?: ReactNode
  danger?: boolean
}

export function MenuItem({
  icon,
  shortcut,
  hint,
  danger,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cn(ITEM, danger ? 'text-danger' : 'text-ink [&_svg]:text-ink-2', className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Trailing hint={hint} shortcut={shortcut} />
    </DropdownMenu.Item>
  )
}

interface MenuRadioItemProps extends ComponentProps<typeof DropdownMenu.RadioItem> {
  hint?: ReactNode
}

/** One of several exclusive choices; the chosen one carries a check mark. */
export function MenuRadioItem({ hint, className, children, ...props }: MenuRadioItemProps) {
  return (
    <DropdownMenu.RadioItem className={cn(ITEM, 'text-ink', className)} {...props}>
      <Indicator />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Trailing hint={hint} />
    </DropdownMenu.RadioItem>
  )
}

/** An option that is on or off; a check mark shows when it is on. */
export function MenuCheckItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(ITEM, 'text-ink', className)} {...props}>
      <Indicator />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenu.CheckboxItem>
  )
}

function Indicator() {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <DropdownMenu.ItemIndicator>
        <Check aria-hidden className="text-ink" />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

function Trailing({ hint, shortcut }: { hint?: ReactNode; shortcut?: string }) {
  return (
    <>
      {hint && <span className="shrink-0 text-xs text-ink-3">{hint}</span>}
      {shortcut && <Kbd plain tone="muted" shortcut={shortcut} />}
    </>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2 pt-2 pb-1 text-xs font-medium text-ink-3 select-none', className)}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
}

interface MenuSubTriggerProps extends ComponentProps<typeof DropdownMenu.SubTrigger> {
  icon?: ReactNode
  /** The current choice inside the submenu, so it can be read without opening it. */
  hint?: ReactNode
}

/** A row that opens a nested menu, for a choice that would otherwise crowd its parent. */
export function MenuSubTrigger({ icon, hint, className, children, ...props }: MenuSubTriggerProps) {
  return (
    <DropdownMenu.SubTrigger
      className={cn(
        ITEM,
        'text-ink data-[state=open]:bg-fill-strong [&_svg]:text-ink-2',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-xs text-ink-3">{hint}</span>}
      <ChevronRight aria-hidden className="-mr-0.5 size-3.5!" />
    </DropdownMenu.SubTrigger>
  )
}

export function MenuSubContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenu.SubContent>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop-in rounded-panel bg-surface p-1 shadow-pop data-[state=closed]:animate-pop-out',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}
