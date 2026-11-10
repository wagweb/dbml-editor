import { memo, useMemo, type CSSProperties } from 'react'
import type { RefModel, SchemaModel } from '@/dbml/model'
import { revealInEditor } from '@/editor/bridge'
import {
  bundleEdges,
  bundleWidth,
  JUNCTION_GROWTH,
  type BundleJunction,
  type BundlePiece,
} from '@/layout/bundles'
import { computeEdges, type EdgeGeometry } from '@/layout/edges'
import { GEOMETRY, portOffsetY, tableTitle } from '@/layout/geometry'
import { roundedPath } from '@/layout/router'
import { getOwn } from '@/lib/record'
import { setHover, useDiagram } from '@/store/diagram'
import { useLinkDrag } from './linkDrag'

/** How long the drawing-in takes to sweep from the leftmost line to the rightmost. */
const DRAW_SPREAD_MS = 420

/** All relations as one SVG below the tables. Highlighted relations are painted last. */
export function EdgeLayer() {
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const routes = useDiagram((s) => s.routes)
  const emphasis = useDiagram((s) => s.emphasis)
  const cursorRefIds = useDiagram((s) => s.cursorRefIds)

  const { edges, pieces, junctions } = useMemo(
    () => bundleEdges(computeEdges(model, boxes, positions, routes)),
    [model, boxes, positions, routes],
  )
  const refs = useMemo(() => new Map(model.refs.map((r) => [r.id, r])), [model])
  // When the relations draw themselves in, they go left to right like the reading
  // direction: each line starts after the ones that begin further left.
  const drawDelays = useMemo(() => {
    const starts = edges
      .map((edge) => ({ id: edge.refId, x: Math.min(...edge.points.map((p) => p.x)) }))
      .sort((a, b) => a.x - b.x)
    const last = Math.max(1, starts.length - 1)
    return new Map(
      starts.map((edge, rank) => [edge.id, Math.round((rank / last) * DRAW_SPREAD_MS)]),
    )
  }, [edges])

  // The order stays as it is. Moving lit lines to the end moved their DOM nodes, which
  // cancels their fade: some lines snapped while others faded, which read as a flicker.
  const ordered = edges
  const lit = (refIds: readonly string[]) => {
    const count = refIds.filter((id) => emphasis.refIds.has(id)).length
    return count === 0 ? 'none' : count === refIds.length ? 'all' : 'some'
  }
  const earliest = (refIds: readonly string[]) =>
    Math.min(...refIds.map((id) => drawDelays.get(id) ?? 0))

  return (
    <svg className="edge-layer" width="1" height="1" aria-hidden>
      {/* Bundles lie under the single lines, which run on inside them. */}
      {pieces.map((piece) => {
        const state = lit(piece.refIds)
        return (
          <BundleLine
            key={piece.key}
            piece={piece}
            lit={state}
            dimmed={state === 'none' && emphasis.focus !== null}
            drawDelay={earliest(piece.refIds)}
          />
        )
      })}
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
            drawDelay={drawDelays.get(edge.refId) ?? 0}
          />
        )
      })}
      {/* Over the single lines: a pointer on a shared stretch means all of it. */}
      {pieces.map((piece) => (
        <BundleHit key={piece.key} piece={piece} model={model} />
      ))}
      {junctions.map((junction) => {
        const state = lit(junction.refIds)
        return (
          <Junction
            key={junction.key}
            junction={junction}
            active={state !== 'none'}
            dimmed={state === 'none' && emphasis.focus !== null}
            drawDelay={earliest(junction.refIds)}
          />
        )
      })}
    </svg>
  )
}

interface BundleLineProps {
  piece: BundlePiece
  /** How many of the relations in it are lit: a fully lit bundle turns accent. */
  lit: 'none' | 'some' | 'all'
  dimmed: boolean
  drawDelay: number
}

/** A shared stretch, heavier the more relations run in it. */
const BundleLine = memo(function BundleLine({ piece, lit, dimmed, drawDelay }: BundleLineProps) {
  return (
    <path
      className="bundle-line"
      d={piece.path}
      pathLength={1}
      data-lit={lit}
      data-dimmed={dimmed}
      style={
        {
          '--bundle-width': `${bundleWidth(piece.refIds.length)}px`,
          '--draw-delay': `${drawDelay}ms`,
        } as CSSProperties
      }
    />
  )
})

/** The pointer target of a shared stretch: lights every relation in it. */
const BundleHit = memo(function BundleHit({
  piece,
  model,
}: {
  piece: BundlePiece
  model: SchemaModel
}) {
  const { root } = piece
  return (
    <path
      className="edge-hit bundle-hit"
      d={piece.path}
      data-canvas-interactive
      onPointerEnter={() =>
        setHover({ kind: 'bundle', key: piece.key, refIds: piece.refIds, root })
      }
      onPointerLeave={() => setHover(null)}
      onClick={() => {
        // The row they all share is the thing to look at in the code.
        const table = model.tables.find((t) => t.id === root.tableId)
        const column = table?.columns.find((c) => c.name === root.column)
        if (column) revealInEditor(column.range)
      }}
    />
  )
})

interface JunctionProps {
  junction: BundleJunction
  active: boolean
  dimmed: boolean
  drawDelay: number
}

/** Where relations of a bundle part: a dot, as on a wiring diagram, so it never reads as a crossing. */
const Junction = memo(function Junction({ junction, active, dimmed, drawDelay }: JunctionProps) {
  const { point, refIds } = junction
  return (
    <path
      className="bundle-junction"
      d={`M${point.x} ${point.y}h0`}
      data-active={active}
      data-dimmed={dimmed}
      style={
        {
          '--junction-size': `${bundleWidth(refIds.length) + JUNCTION_GROWTH}px`,
          '--draw-delay': `${drawDelay}ms`,
        } as CSSProperties
      }
    />
  )
})

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
  /** Milliseconds this line waits when the relations draw themselves in. */
  drawDelay: number
}

const Edge = memo(
  function Edge({ edge, reference, active, dimmed, cursor, drawDelay }: EdgeProps) {
    return (
      <g
        className="edge"
        data-active={active}
        data-dimmed={dimmed}
        data-cursor={cursor}
        data-kind={reference.kind}
        data-ref-id={edge.refId}
        style={{ '--draw-delay': `${drawDelay}ms` } as CSSProperties}
        data-canvas-interactive
        onPointerEnter={() => setHover({ kind: 'ref', refId: edge.refId })}
        onPointerLeave={() => setHover(null)}
        onClick={() => revealInEditor(reference.range)}
      >
        <path className="edge-hit" d={edge.path} />
        <path
          className="edge-line"
          d={edge.path}
          // A unit length lets the line draw in with a dash; enum links keep their dashes.
          pathLength={reference.kind === 'enum' ? undefined : 1}
        />
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
    a.drawDelay === b.drawDelay &&
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
