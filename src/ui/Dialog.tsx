import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  className?: string
  children: ReactNode
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/40 dark:bg-black/60" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[min(720px,calc(100dvh-32px))] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-panel bg-surface shadow-pop outline-none',
            className,
          )}
        >
          <header className="flex items-start gap-4 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[15px] leading-6 font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-fill hover:text-ink"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
