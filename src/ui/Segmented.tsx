import { ToggleGroup } from 'radix-ui'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
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
  const rootRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)

  // Before paint, so the first frame already has the thumb in place. Only a change of
  // choice slides; the first placement jumps.
  useLayoutEffect(() => {
    const root = rootRef.current
    const thumb = thumbRef.current
    if (!root || !thumb) return
    placeThumb(root, thumb, thumb.dataset.placed !== undefined)
    thumb.dataset.placed = ''
  }, [value])

  // Fonts loading or a dialog narrowing can move the segments without a new choice.
  useLayoutEffect(() => {
    const root = rootRef.current
    const thumb = thumbRef.current
    if (!root || !thumb) return
    const observer = new ResizeObserver(() => placeThumb(root, thumb, false))
    observer.observe(root)
    for (const item of root.querySelectorAll('[data-segment]')) observer.observe(item)
    return () => observer.disconnect()
  }, [])

  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      aria-label={label}
      value={value}
      // Radix reports an empty string when the active item is pressed again.
      onValueChange={(next) => next && onChange(next as T)}
      className={cn(
        'relative inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-control bg-fill p-0.5',
        className,
      )}
    >
      <span
        ref={thumbRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-[4px] bg-raised shadow-raised transition-[transform,width,height] duration-200 ease-out"
      />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          data-segment=""
          // Positioned, so the labels paint above the thumb that comes before them. Once
          // chosen, only the text colour eases: a hover fill fading out would sit on top of
          // the thumb as it slides in.
          className="relative h-7 rounded-[4px] px-3 text-xs font-medium whitespace-nowrap text-ink-2 transition-colors duration-150 select-none focus-visible:outline-offset-0 data-[state=off]:hover:bg-fill-strong data-[state=off]:hover:text-ink data-[state=on]:text-ink data-[state=on]:transition-[color]"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

/** Moves the thumb onto the chosen segment's box, or hides it when nothing is chosen. */
function placeThumb(root: HTMLElement, thumb: HTMLElement, slide: boolean) {
  const item = root.querySelector<HTMLElement>('[data-segment][data-state="on"]')
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
