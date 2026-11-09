import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { shortcutLabel } from '@/lib/platform'

export const TooltipProvider = TooltipPrimitive.Provider

interface TooltipProps {
  label: ReactNode
  /** Shortcut in `mod+K` notation, rendered for the current platform. */
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}

export function Tooltip({ label, shortcut, side = 'top', children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-50 flex max-w-64 animate-fade-in items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs leading-5 font-medium text-canvas shadow-lg select-none"
        >
          {label}
          {shortcut && (
            <span className="font-mono text-[11px] text-canvas/60">{shortcutLabel(shortcut)}</span>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
