import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

interface InlineEditProps {
  label: string
  initial: string
  /** Called once, with the new text or null when the edit was cancelled. */
  onDone: (value: string | null) => void
  className?: string
  mono?: boolean
}

/**
 * A text field that takes the place of a name while it is being edited. Enter and leaving
 * the field commit, Escape cancels. The field sizes itself to its text.
 */
export function InlineEdit({ label, initial, onDone, className, mono }: InlineEditProps) {
  const input = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    const element = input.current
    if (!element) return
    element.focus()
    element.select()
  }, [])

  const finish = (value: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(value !== null && value.trim() !== initial ? value : null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The field sits inside draggable, keyboard-driven elements; keys stay here.
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(event.currentTarget.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(null)
    }
  }

  return (
    <input
      ref={input}
      aria-label={label}
      defaultValue={initial}
      maxLength={120}
      spellCheck={false}
      autoComplete="off"
      className={cn(
        'inline-edit min-w-0 rounded-[4px] bg-surface px-1 text-ink shadow-[inset_0_0_0_1.5px_var(--accent)] outline-none',
        mono && 'font-mono',
        className,
      )}
      style={{ width: `calc(${Math.max(initial.length, 3)}ch + 12px)` }}
      onInput={(event) => {
        const field = event.currentTarget
        field.style.width = `calc(${Math.max(field.value.length, 3)}ch + 12px)`
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
