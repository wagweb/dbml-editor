import type { ElkExtendedEdge, ElkNode, ElkPort, LayoutOptions } from 'elkjs/lib/elk-api'
import type { SchemaModel } from '@/dbml/model'
import { portOffsetY, type TableBox } from './geometry'
import { orientRefs } from './orient'
import { chooseRelaxedPairs, estimateSize, pairKey, type Size, type WeightedEdge } from './relax'
import { simplify, type Point } from './router'

export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>
}

export interface LayoutRequest {
  model: SchemaModel
  boxes: ReadonlyMap<string, TableBox>
  /** Screen area the diagram should fill; decides how much the layout may wrap. */
  viewport?: Size
  /**
   * Where the tables sat before this change. The engine then follows their order on screen
   * instead of the order of the source, so a small edit moves little and the diagram stays
   * recognisable.
   */
  previous?: Readonly<Record<string, Point>>
  /**
   * Block pairs that were stacked last time. Reused as they are, so the groups do not
   * swap places when only the size of the cards changes.
   */
  stacked?: readonly string[]
}

export type Side = 'E' | 'W'

export interface StoredRoute {
  points: Point[]
  /** Table the first point belongs to. */
  startTableId: string
  startSide: Side
  endSide: Side
  /** Endpoint fingerprint; the route is only valid while both ends still sit there. */
  signature: string
}

export interface LayoutResult {
  positions: Record<string, Point>
  routes: Record<string, StoredRoute>
  /** Block pairs drawn as brackets (stacked instead of side by side). */
  stacked?: string[]
}

/** Space a group reserves around its tables, matching what the canvas draws. */
export const GROUP_PADDING = { top: 44, side: 20, bottom: 20 } as const

const DEFAULT_VIEWPORT: Size = { width: 1280, height: 800 }
/** Bracket relations are only worth it if the diagram can be shown this much larger. */
const MIN_WRAP_GAIN = 1.1

/** Applies to the root and to every group, since ELK does not inherit options. */
const SHARED_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  // Room between layers for cardinality markers and one lane per relation.
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.spacing.nodeNode': '28',
  'elk.spacing.edgeNode': '22',
  'elk.spacing.edgeEdge': '12',
  'elk.spacing.componentComponent': '56',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.thoroughness': '24',
}

const ROOT_OPTIONS: LayoutOptions = {
  ...SHARED_OPTIONS,
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  // Follow the order of the DBML source wherever it costs no crossings, so the diagram
  // stays predictable while typing. Root only: ELK crashes when groups carry this option.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.compaction.connectedComponents': 'true',
  'elk.separateConnectedComponents': 'true',
}

const TABLE_OPTIONS: LayoutOptions = { 'elk.portConstraints': 'FIXED_POS' }

const GROUP_OPTIONS: LayoutOptions = {
  ...SHARED_OPTIONS,
  'elk.padding': `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.side},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.side}]`,
}

export function routeSignature(start: Point, end: Point): string {
  return `${start.x},${start.y}>${end.x},${end.y}`
}

interface PlannedEdge {
  refId: string
  /** For a bracket both ends leave eastwards and meet at a junction further right. */
  shape: 'direct' | 'bracket'
  leftTableId: string
  rightTableId: string
  leftOffsetY: number
  rightOffsetY: number
}

export async function runLayout(
  elk: ElkLike,
  request: LayoutRequest,
  overrides: LayoutOptions = {},
): Promise<LayoutResult> {
  const { model, boxes } = request
  const tables = model.tables.filter((t) => boxes.has(t.id))
  if (tables.length === 0) return { positions: {}, routes: {} }

  const groupOf = new Map(tables.map((t) => [t.id, t.groupId]))
  const blockOf = (tableId: string) => groupOf.get(tableId) ?? tableId
  const orientation = orientRefs(
    tables.map((t) => t.id),
    model.refs,
    blockOf,
  )

  const edges: PlannedEdge[] = []
  for (const ref of model.refs) {
    const direction = orientation.get(ref.id)
    const leftBox = direction && boxes.get(direction.leftTableId)
    const rightBox = direction && boxes.get(direction.rightTableId)
    if (!direction || !leftBox || !rightBox) continue
    const leftEnd = ref.parent.tableId === direction.leftTableId ? ref.parent : ref.child
    const rightEnd = leftEnd === ref.parent ? ref.child : ref.parent
    edges.push({
      refId: ref.id,
      shape: 'direct',
      leftTableId: direction.leftTableId,
      rightTableId: direction.rightTableId,
      leftOffsetY: portOffsetY(leftBox, leftEnd.columns[0]),
      rightOffsetY: portOffsetY(rightBox, rightEnd.columns[0]),
    })
  }

  const layout = async (planned: PlannedEdge[]) =>
    readResult(await elk.layout(buildGraph(request, planned, overrides)), request, planned)
  const stack = (pairs: ReadonlySet<string>) =>
    edges.map((edge) =>
      pairs.has(pairKey(blockOf(edge.leftTableId), blockOf(edge.rightTableId)))
        ? { ...edge, shape: 'bracket' as const }
        : edge,
    )
  const blockPairs = new Set(
    edges.map((edge) => pairKey(blockOf(edge.leftTableId), blockOf(edge.rightTableId))),
  )

  // A relayout of a known diagram keeps the earlier decision while all its pairs still exist.
  const kept = request.stacked
  if (request.previous && kept && kept.every((pair) => blockPairs.has(pair))) {
    const pairs = new Set(kept)
    return { ...(await layout(stack(pairs))), stacked: [...pairs] }
  }

  const plain = await layout(edges)
  const relaxed = relaxedBlockPairs(request, edges, blockOf)
  if (relaxed.size === 0) return { ...plain, stacked: [] }

  // The choice above rests on an estimate, so the wrapped variant has to prove itself.
  const wrapped = await layout(stack(relaxed))
  const viewport = request.viewport ?? DEFAULT_VIEWPORT
  const gain = fitScale(wrapped, boxes, viewport) / fitScale(plain, boxes, viewport)
  return gain >= MIN_WRAP_GAIN ? { ...wrapped, stacked: [...relaxed] } : { ...plain, stacked: [] }
}

/** Zoom at which the laid out tables fit the viewport, never above 100%. */
function fitScale(
  result: LayoutResult,
  boxes: ReadonlyMap<string, TableBox>,
  viewport: Size,
): number {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [id, point] of Object.entries(result.positions)) {
    const box = boxes.get(id)
    if (!box) continue
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x + box.width)
    bottom = Math.max(bottom, point.y + box.height)
  }
  if (!Number.isFinite(left)) return 1
  return Math.min(
    1,
    viewport.width / Math.max(right - left, 1),
    viewport.height / Math.max(bottom - top, 1),
  )
}

/** Decides which pairs of blocks may stack instead of sitting in consecutive columns. */
function relaxedBlockPairs(
  request: LayoutRequest,
  edges: PlannedEdge[],
  blockOf: (tableId: string) => string,
): Set<string> {
  const { model, boxes } = request
  const members = new Map<string, string[]>()
  for (const table of model.tables) {
    if (!boxes.has(table.id)) continue
    const block = blockOf(table.id)
    members.set(block, [...(members.get(block) ?? []), table.id])
  }

  const sizes = new Map<string, Size>()
  for (const [block, tableIds] of members) {
    const inner = edges
      .filter((e) => blockOf(e.leftTableId) === block && blockOf(e.rightTableId) === block)
      .map((e) => ({ from: e.leftTableId, to: e.rightTableId }))
    const content = estimateSize(new Map(tableIds.map((id) => [id, boxes.get(id)!])), inner)
    const isGroup = tableIds.length > 1 || block !== tableIds[0]
    sizes.set(
      block,
      isGroup
        ? {
            width: content.width + 2 * GROUP_PADDING.side,
            height: content.height + GROUP_PADDING.top + GROUP_PADDING.bottom,
          }
        : content,
    )
  }

  const between = new Map<string, WeightedEdge>()
  for (const edge of edges) {
    const from = blockOf(edge.leftTableId)
    const to = blockOf(edge.rightTableId)
    if (from === to) continue
    const key = pairKey(from, to)
    const known = between.get(key)
    if (known) known.weight += 1
    else between.set(key, { from, to, weight: 1 })
  }

  return chooseRelaxedPairs(sizes, [...between.values()], request.viewport ?? DEFAULT_VIEWPORT)
}

function portId(tableId: string, offsetY: number, side: Side): string {
  return `port|${tableId}|${offsetY}|${side}`
}

const junctionId = (refId: string) => `junction|${refId}`
const junctionPort = (refId: string) => `junction-port|${refId}`
const startEdgeId = (refId: string) => `${refId}|start`
const endEdgeId = (refId: string) => `${refId}|end`

function buildGraph(
  request: LayoutRequest,
  edges: PlannedEdge[],
  overrides: LayoutOptions,
): ElkNode {
  const { model, boxes, previous } = request
  // The engine follows model order wherever it costs nothing. Without previous positions
  // that is the order of the source; with them it is the order on screen, top to bottom,
  // so a relayout after a small change keeps tables and groups where the eye left them.
  const tables = previous ? sortBySeat(model.tables, previous) : model.tables

  const ports = new Map<string, Map<string, ElkPort>>()
  const addPort = (tableId: string, offsetY: number, side: Side) => {
    const box = boxes.get(tableId)
    if (!box) return
    const id = portId(tableId, offsetY, side)
    const tablePorts = ports.get(tableId) ?? new Map<string, ElkPort>()
    tablePorts.set(id, {
      id,
      x: side === 'E' ? box.width : 0,
      y: offsetY,
      width: 0,
      height: 0,
      layoutOptions: { 'elk.port.side': side === 'E' ? 'EAST' : 'WEST' },
    })
    ports.set(tableId, tablePorts)
  }
  for (const edge of edges) {
    addPort(edge.leftTableId, edge.leftOffsetY, 'E')
    addPort(edge.rightTableId, edge.rightOffsetY, edge.shape === 'bracket' ? 'E' : 'W')
  }

  const tableNode = (id: string): ElkNode | undefined => {
    const box = boxes.get(id)
    if (!box) return undefined
    return {
      id,
      width: box.width,
      height: box.height,
      layoutOptions: TABLE_OPTIONS,
      ports: [...(ports.get(id)?.values() ?? [])],
    }
  }

  const grouped = new Set<string>()
  const groupNodes = new Map<string, ElkNode>()
  for (const group of model.groups) {
    const memberIds = previous
      ? sortBySeat(
          group.tableIds.map((id) => ({ id })),
          previous,
        ).map((t) => t.id)
      : group.tableIds
    const children = memberIds
      .filter((id) => !grouped.has(id))
      .map((id) => {
        grouped.add(id)
        return tableNode(id)
      })
      .filter((node): node is ElkNode => node !== undefined)
    if (children.length > 0) {
      groupNodes.set(group.id, {
        id: group.id,
        layoutOptions: { ...GROUP_OPTIONS, ...overrides },
        children,
      })
    }
  }

  // Keep model order at the top level: a group takes the slot of its first table.
  const children: ElkNode[] = []
  const emittedGroups = new Set<string>()
  for (const table of tables) {
    if (!grouped.has(table.id)) {
      const node = tableNode(table.id)
      if (node) children.push(node)
      continue
    }
    const group = model.groups.find((g) => g.tableIds.includes(table.id) && groupNodes.has(g.id))
    const node = group && groupNodes.get(group.id)
    if (group && node && !emittedGroups.has(group.id)) {
      emittedGroups.add(group.id)
      children.push(node)
    }
  }

  const elkEdges: ElkExtendedEdge[] = []
  for (const edge of edges) {
    const left = portId(edge.leftTableId, edge.leftOffsetY, 'E')
    if (edge.shape === 'direct') {
      elkEdges.push({
        id: edge.refId,
        sources: [left],
        targets: [portId(edge.rightTableId, edge.rightOffsetY, 'W')],
      })
      continue
    }
    // A bracket is two edges that meet in an invisible junction to the right of both tables.
    children.push({
      id: junctionId(edge.refId),
      width: 1,
      height: 1,
      layoutOptions: TABLE_OPTIONS,
      ports: [
        {
          id: junctionPort(edge.refId),
          x: 0,
          y: 0.5,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': 'WEST' },
        },
      ],
    })
    elkEdges.push(
      { id: startEdgeId(edge.refId), sources: [left], targets: [junctionPort(edge.refId)] },
      {
        id: endEdgeId(edge.refId),
        sources: [portId(edge.rightTableId, edge.rightOffsetY, 'E')],
        targets: [junctionPort(edge.refId)],
      },
    )
  }

  return {
    id: 'root',
    layoutOptions: { ...ROOT_OPTIONS, ...overrides },
    children,
    edges: elkEdges,
  }
}

/** Top to bottom, then left to right; tables without a seat keep their relative order last. */
function sortBySeat<T extends { id: string }>(
  items: readonly T[],
  previous: Readonly<Record<string, Point>>,
): T[] {
  const at = (item: T) => (Object.hasOwn(previous, item.id) ? previous[item.id] : undefined)
  return items
    .map((item, index) => ({ item, index, point: at(item) }))
    .sort((a, b) => {
      if (!a.point || !b.point) return Number(!a.point) - Number(!b.point) || a.index - b.index
      return a.point.y - b.point.y || a.point.x - b.point.x || a.index - b.index
    })
    .map((entry) => entry.item)
}

function readResult(graph: ElkNode, request: LayoutRequest, edges: PlannedEdge[]): LayoutResult {
  const { boxes } = request
  // Collected in a Map: a table may be called `__proto__` or `constructor`.
  const placed = new Map<string, Point>()
  const sections = new Map<string, Point[]>()

  const visit = (node: ElkNode) => {
    if (boxes.has(node.id)) {
      placed.set(node.id, { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) })
    }
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0]
      if (section) {
        sections.set(edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(graph)

  const routes: Record<string, StoredRoute> = {}
  for (const edge of edges) {
    const left = placed.get(edge.leftTableId)
    const right = placed.get(edge.rightTableId)
    const leftBox = boxes.get(edge.leftTableId)
    const rightBox = boxes.get(edge.rightTableId)
    if (!left || !right || !leftBox || !rightBox) continue

    const bracket = edge.shape === 'bracket'
    const raw = bracket
      ? joinAtJunction(sections.get(startEdgeId(edge.refId)), sections.get(endEdgeId(edge.refId)))
      : sections.get(edge.refId)
    if (!raw) continue

    const start = { x: left.x + leftBox.width, y: left.y + edge.leftOffsetY }
    const end = {
      x: bracket ? right.x + rightBox.width : right.x,
      y: right.y + edge.rightOffsetY,
    }
    routes[edge.refId] = {
      points: snapEnds(raw, start, end),
      startTableId: edge.leftTableId,
      startSide: 'E',
      endSide: bracket ? 'E' : 'W',
      signature: routeSignature(start, end),
    }
  }

  return { positions: Object.fromEntries(placed), routes }
}

/** Both halves of a bracket end in the junction; the second half is walked backwards. */
function joinAtJunction(
  first: Point[] | undefined,
  second: Point[] | undefined,
): Point[] | undefined {
  if (!first || !second) return undefined
  return [...first, ...second.toReversed()]
}

/**
 * Tables land on whole pixels, so the route's ends are re-attached to the rounded ports
 * and the neighbouring bends follow to keep every segment axis-aligned.
 */
function snapEnds(raw: Point[], start: Point, end: Point): Point[] {
  const points = simplify(raw.map((p) => ({ x: p.x, y: p.y })))
  if (points.length <= 3) {
    if (start.y === end.y) return [start, end]
    const middle = start.x === end.x ? start.x + 24 : (start.x + end.x) / 2
    return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end]
  }
  points[0] = start
  points[1] = { x: points[1]!.x, y: start.y }
  points[points.length - 1] = end
  points[points.length - 2] = { x: points[points.length - 2]!.x, y: end.y }
  return simplify(points)
}
