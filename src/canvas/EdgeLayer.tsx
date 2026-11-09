import { memo, useMemo } from 'react'
import type { RefModel } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import { computeEdges, type EdgeGeometry } from '@/layout/edges'
import { GEOMETRY, portOffsetY, tableTitle } from '@/layout/geometry'
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
  const cursorRefIds = useDiagram((s) => s.cursorRefIds)

  const edges = useMemo(
    () => computeEdges(model, boxes, positions, routes),
    [model, boxes, positions, routes],
  )
  const refs = useMemo(() => new Map(model.refs.map((r) => [r.id, r])), [model])

  // The order stays as it is. Moving lit lines to the end moved their DOM nodes, which
  // cancels their fade: some lines snapped while others faded, which read as a flicker.
  const ordered = edges

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
            cursor={cursorRefIds.has(edge.refId)}
          />
        )
      })}
    </svg>
  )
}

/** The relation being drawn sits above the cards, so it can be seen over its target. */
export function LinkPreviewLayer() {
  const active = useLinkDrag((s) => s.from !== null)
  if (!active) return null
  return (
    <svg className="edge-layer link-preview-layer" width="1" height="1" aria-hidden>
      <LinkPreview />
    </svg>
  )
}

interface EdgeProps {
  edge: EdgeGeometry
  reference: RefModel
  active: boolean
  dimmed: boolean
  /** The code cursor is in this relation's definition, or in one of its columns. */
  cursor: boolean
}

const Edge = memo(
  function Edge({ edge, reference, active, dimmed, cursor }: EdgeProps) {
    return (
      <g
        className="edge"
        data-active={active}
        data-dimmed={dimmed}
        data-cursor={cursor}
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
    a.cursor === b.cursor &&
    a.reference === b.reference,
)

/** The relation being dragged from a column: a line from its row to the pointer. */
function LinkPreview() {
  const from = useLinkDrag((s) => s.from)
  const pointer = useLinkDrag((s) => s.pointer)
  const target = useLinkDrag((s) => s.target)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const model = useDiagram((s) => s.model)
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

  const targetTable = target ? model.tables.find((t) => t.id === target.tableId) : undefined
  const label = target && targetTable ? `${tableTitle(targetTable)}.${target.column}` : null

  return (
    <g className="edge edge-preview" data-snapped={target !== null}>
      <path className="edge-line" d={roundedPath(points, GEOMETRY.grid)} />
      <circle className="edge-preview-end" cx={end.x} cy={end.y} r={4} />
      {/* Next to the pointer, where the eye is; the edge of the canvas would cut it off. */}
      {label && (
        <text className="edge-preview-label" x={pointer.x} y={pointer.y}>
          {label}
        </text>
      )}
    </g>
  )
}
