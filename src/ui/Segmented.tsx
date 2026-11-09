import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}

/** Single-choice switch for a small, fixed set of options. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix reports an empty string when the active item is pressed again.
      onValueChange={(next) => next && onChange(next as T)}
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-control bg-fill p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="h-7 rounded-[4px] px-2.5 text-xs font-medium whitespace-nowrap text-ink-2 transition-colors duration-100 select-none hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--line-input)]"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
