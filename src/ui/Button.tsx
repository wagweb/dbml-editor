import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

type Variant = 'primary' | 'secondary' | 'ghost'

/**
 * `data-[state=open]` is set by the menu or popover a button opens. The button keeps its
 * hover look for as long as that menu is open, so it is clear where the menu came from.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-canvas hover:bg-ink/85 active:bg-ink/75 data-[state=open]:bg-ink/85',
  secondary:
    'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-fill active:bg-fill-strong data-[state=open]:bg-fill',
  ghost:
    'text-ink-2 hover:bg-fill hover:text-ink active:bg-fill-strong data-[state=open]:bg-fill data-[state=open]:text-ink',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-100 select-none disabled:opacity-45',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Accessible name, also shown as the tooltip. */
  label: string
  shortcut?: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  active?: boolean
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  shortcut,
  tooltipSide,
  active,
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-control transition-colors duration-100 select-none disabled:opacity-40 [&_svg]:size-4',
          active
            ? 'bg-accent-soft text-accent'
            : 'text-ink-2 hover:bg-fill hover:text-ink active:bg-fill-strong data-[state=open]:bg-fill data-[state=open]:text-ink',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
}
