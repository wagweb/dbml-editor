import { useEffect, useMemo, useRef } from 'react'
import { describeRefKind } from '@/dbml/model'
import { tableTitle } from '@/layout/geometry'
import { useDiagram } from '@/store/diagram'

/** Spells out the relation under the pointer: which column references which. */
export function EdgeTooltip() {
  const model = useDiagram((s) => s.model)
  const refId = useDiagram((s) => (s.hover?.kind === 'ref' ? s.hover.refId : null))
  const element = useRef<HTMLDivElement>(null)

  const ref = useMemo(() => model.refs.find((r) => r.id === refId), [model, refId])

  useEffect(() => {
    if (!ref) return
    const follow = (event: PointerEvent) => {
      const tip = element.current
      const parent = tip?.offsetParent
      if (!tip || !parent) return
      const bounds = parent.getBoundingClientRect()
      const x = Math.min(event.clientX - bounds.left + 14, bounds.width - tip.offsetWidth - 8)
      const y = Math.min(event.clientY - bounds.top + 16, bounds.height - tip.offsetHeight - 8)
      tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`
      tip.style.visibility = 'visible'
    }
    window.addEventListener('pointermove', follow)
    return () => window.removeEventListener('pointermove', follow)
  }, [ref])

  if (!ref) return null

  const title = (id: string) => {
    const table = model.tables.find((t) => t.id === id)
    return table ? tableTitle(table) : id
  }
  const actions = [
    ref.onDelete && `on delete ${ref.onDelete}`,
    ref.onUpdate && `on update ${ref.onUpdate}`,
  ].filter(Boolean)

  return (
    <div
      ref={element}
      role="tooltip"
      className="pointer-events-none invisible absolute top-0 left-0 z-20 max-w-80 rounded-md bg-ink px-2.5 py-1.5 text-xs text-canvas shadow-lg"
    >
      <p className="font-mono leading-5">
        {title(ref.child.tableId)}.{ref.child.columns.join(', ')}
        <span className="text-canvas/55"> references </span>
        {title(ref.parent.tableId)}.{ref.parent.columns.join(', ')}
      </p>
      <p className="leading-4 text-canvas/65">
        {[ref.name, describeRefKind(ref.kind), ...actions].filter(Boolean).join(', ')}
      </p>
    </div>
  )
}
