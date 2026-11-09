import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { EDITOR_DEFAULT_WIDTH, EDITOR_MAX_WIDTH, EDITOR_MIN_WIDTH, useUi } from '@/store/ui'

const KEY_STEP = 24

/** Draggable divider between the code and the diagram. */
export function Splitter() {
  const width = useUi((s) => s.editorWidth)
  const setEditorWidth = useUi((s) => s.setEditorWidth)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = { startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setEditorWidth(drag.current.startWidth + event.clientX - drag.current.startX)
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: width - KEY_STEP,
      ArrowRight: width + KEY_STEP,
      Home: EDITOR_MIN_WIDTH,
      End: EDITOR_MAX_WIDTH,
    }
    const target = targets[event.key]
    if (target === undefined) return
    event.preventDefault()
    setEditorWidth(target)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize code panel"
      aria-valuemin={EDITOR_MIN_WIDTH}
      aria-valuemax={EDITOR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setEditorWidth(EDITOR_DEFAULT_WIDTH)}
      onKeyDown={onKeyDown}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-[background-color,width] duration-100 group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent group-active:w-0.5 group-active:bg-accent" />
    </div>
  )
}
