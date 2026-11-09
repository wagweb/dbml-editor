import { Tabs as TabsPrimitive, ToggleGroup } from 'radix-ui'
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'

/** The track: a fill with the thumb and the segments on it. Shared by switches and tabs. */
const TRACK = 'relative inline-grid grid-flow-col gap-0.5 rounded-control bg-fill p-0.5'

/**
 * One segment. Positioned, so its label paints above the thumb that comes before it. Once
 * chosen, only the text colour eases: a hover fill fading out would sit on top of the
 * thumb as it slides in. Switches report `on`/`off`, tabs `active`/`inactive`.
 */
const SEGMENT =
  'relative h-7 rounded-[4px] px-3 text-xs font-medium whitespace-nowrap text-ink-2 transition-colors duration-150 select-none focus-visible:outline-offset-0 data-[state=inactive]:hover:bg-fill-strong data-[state=inactive]:hover:text-ink data-[state=off]:hover:bg-fill-strong data-[state=off]:hover:text-ink data-[state=active]:text-ink data-[state=active]:transition-[color] data-[state=on]:text-ink data-[state=on]:transition-[color]'

/** The raised thumb, placed by `useSlidingThumb`. */
function Thumb({ thumbRef }: { thumbRef: RefObject<HTMLSpanElement | null> }) {
  return (
    <span
      ref={thumbRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 rounded-[4px] bg-raised shadow-raised transition-[transform,width,height] duration-200 ease-out"
    />
  )
}

/**
 * Keeps the thumb on the chosen segment. Before paint, so the first frame already has it in
 * place; only a change of choice slides, the first placement jumps. Fonts loading or a
 * narrowing container can move the segments without a new choice, so it also follows size.
 */
function useSlidingThumb(choice: unknown) {
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const thumb = thumbRef.current
    if (!root || !thumb) return
    placeThumb(root, thumb, thumb.dataset.placed !== undefined)
    thumb.dataset.placed = ''
  }, [choice])

  useLayoutEffect(() => {
    const root = rootRef.current
    const thumb = thumbRef.current
    if (!root || !thumb) return
    const observer = new ResizeObserver(() => placeThumb(root, thumb, false))
    observer.observe(root)
    for (const item of root.querySelectorAll('[data-segment]')) observer.observe(item)
    return () => observer.disconnect()
  }, [])

  return { rootRef, thumbRef }
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  /** Labels may carry a count; their text is the option's accessible name. */
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  className?: string
}

/**
 * Single-choice switch for a small, fixed set of options.
 *
 * One raised thumb slides to the chosen segment (a transform, so it stays off the main
 * thread). It is framed at 3:1, so the choice does not rest on the text colour. Segments
 * share the width of the widest label where there is room, so the switch keeps its width
 * whatever is chosen; where there is not, the grid gives way and the thumb follows, because
 * it is placed from the segment's measured box. The gap between segments keeps a hovered
 * segment's fill clear of the thumb's ring.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  const { rootRef, thumbRef } = useSlidingThumb(value)

  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      aria-label={label}
      value={value}
      // Radix reports an empty string when the active item is pressed again.
      onValueChange={(next) => next && onChange(next as T)}
      className={cn(TRACK, 'auto-cols-fr', className)}
    >
      <Thumb thumbRef={thumbRef} />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          data-segment=""
          className={SEGMENT}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

interface TabListProps {
  label: string
  /** The open tab, so the thumb knows when to move. */
  value: string
  tabs: readonly { value: string; label: ReactNode }[]
  className?: string
}

/**
 * Tabs in the switch's look, for panels whose content changes with the choice. Real tabs
 * (tablist, tab, tabpanel), not radios. Each tab is as wide as its label needs and the rest
 * of the width is shared out, so a long label never truncates.
 */
export function TabList({ label, value, tabs, className }: TabListProps) {
  const { rootRef, thumbRef } = useSlidingThumb(value)
  return (
    <TabsPrimitive.List
      ref={rootRef}
      aria-label={label}
      className={cn(TRACK, 'auto-cols-auto', className)}
    >
      <Thumb thumbRef={thumbRef} />
      {tabs.map((tab) => (
        <TabsPrimitive.Trigger
          key={tab.value}
          value={tab.value}
          data-segment=""
          className={SEGMENT}
        >
          {tab.label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  )
}

export const Tabs = TabsPrimitive.Root
export const TabPanel = TabsPrimitive.Content

/**
 * A count inside a segment label. It keeps the segment's text colour, which is the only
 * grey that reaches 4.5:1 on the raised thumb in dark mode, and is quieter by weight.
 */
export function SegmentCount({ children }: { children: ReactNode }) {
  return <span className="ml-1.5 font-normal tabular-nums">{children}</span>
}

/** Moves the thumb onto the chosen segment's box, or hides it when nothing is chosen. */
function placeThumb(root: HTMLElement, thumb: HTMLElement, slide: boolean) {
  const item = root.querySelector<HTMLElement>(
    '[data-segment][data-state="on"], [data-segment][data-state="active"]',
  )
  thumb.hidden = item === null
  if (!item) return
  // Rects keep the fractions that offsetLeft and offsetWidth round away. Dividing by the
  // scale undoes a transform around the switch, such as a dialog that is still popping in.
  const box = root.getBoundingClientRect()
  const scale = box.width / Number.parseFloat(getComputedStyle(root).width) || 1
  const rect = item.getBoundingClientRect()
  if (!slide) thumb.style.transition = 'none'
  thumb.style.width = `${rect.width / scale}px`
  thumb.style.height = `${rect.height / scale}px`
  thumb.style.transform = `translate(${(rect.left - box.left) / scale}px, ${(rect.top - box.top) / scale}px)`
  if (!slide) {
    // Commit the jump before the transition comes back.
    void thumb.offsetWidth
    thumb.style.transition = ''
  }
}
