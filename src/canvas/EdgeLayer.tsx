import { memo, useMemo } from 'react'
import type { RefModel } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { computeEdges, type EdgeGeometry } from '@/layout/edges'
import { GEOMETRY, portOffsetY } from '@/layout/geometry'
import { roundedPath } from '@/layout/router'
import { getOwn } from '@/lib/record'
import { setHover, useDiagram } from '@/store/diagram'
import { useLinkDrag } from './linkDrag'

/** All relations as one SVG below the tables. Highlighted relations are painted last. */
export function EdgeLayer() {
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const routes = useDiagram((s) => s.routes)
  const emphasis = useDiagram((s) => s.emphasis)

  const edges = useMemo(
    () => computeEdges(model, boxes, positions, routes),
    [model, boxes, positions, routes],
  )
  const refs = useMemo(() => new Map(model.refs.map((r) => [r.id, r])), [model])

  const ordered = useMemo(() => {
    if (emphasis.refIds.size === 0) return edges
    return [
      ...edges.filter((e) => !emphasis.refIds.has(e.refId)),
      ...edges.filter((e) => emphasis.refIds.has(e.refId)),
    ]
  }, [edges, emphasis])

  return (
    <svg className="edge-layer" width="1" height="1" aria-hidden>
      {ordered.map((edge) => {
        const ref = refs.get(edge.refId)
        if (!ref) return null
        const active = emphasis.refIds.has(edge.refId)
        return (
          <Edge
            key={edge.refId}
            edge={edge}
            reference={ref}
            active={active}
            dimmed={!active && emphasis.focus !== null}
          />
        )
      })}
      <LinkPreview />
    </svg>
  )
}

interface EdgeProps {
  edge: EdgeGeometry
  reference: RefModel
  active: boolean
  dimmed: boolean
}

const Edge = memo(
  function Edge({ edge, reference, active, dimmed }: EdgeProps) {
    return (
      <g
        className="edge"
        data-active={active}
        data-dimmed={dimmed}
        data-kind={reference.kind}
        data-ref-id={edge.refId}
        data-canvas-interactive
        onPointerEnter={() => setHover({ kind: 'ref', refId: edge.refId })}
        onPointerLeave={() => setHover(null)}
        onClick={() => revealInEditor(reference.range)}
      >
        <path className="edge-hit" d={edge.path} />
        <path className="edge-line" d={edge.path} />
        <path className="edge-marker" d={edge.markers} />
        {active && reference.kind !== 'enum' && (
          <path
            className="edge-flow"
            d={edge.path}
            // The pulse always runs from the referencing row to the referenced one.
            // Two animations run on this path: only the travelling one is reversed, the fade
            // at the end always runs forwards.
            style={{ animationDirection: edge.startsAtChild ? 'normal' : 'reverse, normal' }}
          />
        )}
      </g>
    )
  },
  (a, b) =>
    a.edge.path === b.edge.path &&
    a.edge.markers === b.edge.markers &&
    a.edge.startsAtChild === b.edge.startsAtChild &&
    a.active === b.active &&
    a.dimmed === b.dimmed &&
    a.reference === b.reference,
)

/** The relation being dragged from a column: a line from its row to the pointer. */
function LinkPreview() {
  const from = useLinkDrag((s) => s.from)
  const pointer = useLinkDrag((s) => s.pointer)
  const target = useLinkDrag((s) => s.target)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  if (!from || !pointer) return null

  const box = boxes.get(from.tableId)
  const position = getOwn(positions, from.tableId)
  if (!box || !position) return null
  const startY = position.y + portOffsetY(box, from.column)

  // Snap to the row under the pointer, so the drop target is unmistakable.
  const targetBox = target && boxes.get(target.tableId)
  const targetPosition = target && getOwn(positions, target.tableId)
  const end =
    targetBox && targetPosition
      ? {
          x:
            pointer.x < targetPosition.x + targetBox.width / 2
              ? targetPosition.x
              : targetPosition.x + targetBox.width,
          y: targetPosition.y + portOffsetY(targetBox, target.column),
        }
      : pointer
  const leavesRight = end.x >= position.x + box.width / 2
  const start = { x: leavesRight ? position.x + box.width : position.x, y: startY }
  const midX = (start.x + end.x) / 2
  const points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]

  return (
    <g className="edge edge-preview" data-snapped={target !== null}>
      <path className="edge-line" d={roundedPath(points, GEOMETRY.grid)} />
      <circle className="edge-preview-end" cx={end.x} cy={end.y} r={4} />
    </g>
  )
}
