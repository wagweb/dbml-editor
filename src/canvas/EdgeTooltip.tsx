import { useEffect, useMemo, useRef } from 'react'
import { describeRefKind, type RefModel, type SchemaModel } from '@/dbml/model'
import { tableTitle } from '@/layout/geometry'
import { useDiagram, type Hover } from '@/store/diagram'

/** A long bundle lists this many columns and counts the rest. */
const LISTED = 8

type LineHover = Extract<Hover, { kind: 'ref' } | { kind: 'bundle' }>

/**
 * Spells out what is under the pointer: for a single line which column references which,
 * for a bundle the row it starts at and every column it leads to.
 */
export function EdgeTooltip() {
  const model = useDiagram((s) => s.model)
  const hover = useDiagram((s) =>
    s.hover?.kind === 'ref' || s.hover?.kind === 'bundle' ? s.hover : null,
  )
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hover) return
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
  }, [hover])

  if (!hover) return null
  return (
    <div
      ref={element}
      role="tooltip"
      className="pointer-events-none invisible absolute top-0 left-0 z-20 max-w-80 rounded-md bg-ink px-2.5 py-1.5 text-xs text-canvas shadow-lg"
    >
      {hover.kind === 'ref' ? (
        <RefFacts model={model} refId={hover.refId} />
      ) : (
        <BundleFacts model={model} hover={hover} />
      )}
    </div>
  )
}

function useTitle(model: SchemaModel) {
  return useMemo(() => {
    const titles = new Map(model.tables.map((t) => [t.id, tableTitle(t)]))
    return (id: string) => titles.get(id) ?? id
  }, [model])
}

function RefFacts({ model, refId }: { model: SchemaModel; refId: string }) {
  const title = useTitle(model)
  const ref = model.refs.find((r) => r.id === refId)
  if (!ref) return null
  const actions = [
    ref.onDelete && `on delete ${ref.onDelete}`,
    ref.onUpdate && `on update ${ref.onUpdate}`,
  ].filter(Boolean)
  return (
    <>
      <p className="font-mono leading-5">
        {title(ref.child.tableId)}.{ref.child.columns.join(', ')}
        <span className="text-canvas/55"> references </span>
        {title(ref.parent.tableId)}.{ref.parent.columns.join(', ')}
      </p>
      <p className="leading-4 text-canvas/65">
        {[ref.name, describeRefKind(ref.kind), ...actions].filter(Boolean).join(', ')}
      </p>
    </>
  )
}

function BundleFacts({
  model,
  hover,
}: {
  model: SchemaModel
  hover: Extract<LineHover, { kind: 'bundle' }>
}) {
  const title = useTitle(model)
  const { root } = hover
  const byId = new Map(model.refs.map((r) => [r.id, r]))
  const refs = hover.refIds.flatMap((id) => byId.get(id) ?? [])
  // The other end of each relation: the referencing column, or the referenced one.
  const far = (ref: RefModel) => (root.referenced ? ref.child : ref.parent)
  const listed = refs.slice(0, LISTED)
  return (
    <>
      <p className="leading-5">
        <span className="font-mono">
          {title(root.tableId)}.{root.column}
        </span>
        <span className="text-canvas/65">
          {root.referenced ? ' is referenced by ' : ' references '}
          {refs.length} columns
        </span>
      </p>
      <ul className="font-mono leading-4">
        {listed.map((ref) => (
          <li key={ref.id}>
            {title(far(ref).tableId)}.{far(ref).columns.join(', ')}
          </li>
        ))}
      </ul>
      {refs.length > listed.length && (
        <p className="leading-4 text-canvas/65">and {refs.length - listed.length} more</p>
      )}
    </>
  )
}
