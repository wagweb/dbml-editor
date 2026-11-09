export interface Size {
  width: number
  height: number
}

export interface WeightedEdge {
  from: string
  to: string
  /** Number of relations the edge stands for. */
  weight: number
}

const GAP_X = 64
const GAP_Y = 28
/** A relation is only bent into a bracket if the diagram gets at least this much larger. */
const MIN_GAIN = 1.12
const MAX_ROUNDS = 8

export function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`
}

/** Longest-path layer of every node in a DAG. */
export function layersOf(
  nodes: readonly string[],
  edges: readonly Pick<WeightedEdge, 'from' | 'to'>[],
): Map<string, number> {
  const incoming = new Map<string, string[]>(nodes.map((node) => [node, []]))
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from)

  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const layer = (node: string): number => {
    const known = layers.get(node)
    if (known !== undefined) return known
    // The input is acyclic by construction; the guard only stops a bad input from looping.
    if (visiting.has(node)) return 0
    visiting.add(node)
    let value = 0
    for (const previous of incoming.get(node) ?? []) value = Math.max(value, layer(previous) + 1)
    visiting.delete(node)
    layers.set(node, value)
    return value
  }
  for (const node of nodes) layer(node)
  return layers
}

/** Rough size of a left-to-right layered drawing: layers side by side, nodes stacked. */
export function estimateSize(
  sizes: ReadonlyMap<string, Size>,
  edges: readonly Pick<WeightedEdge, 'from' | 'to'>[],
): Size {
  const nodes = [...sizes.keys()]
  if (nodes.length === 0) return { width: 0, height: 0 }
  const layers = layersOf(nodes, edges)

  const widths = new Map<number, number>()
  const heights = new Map<number, number>()
  for (const node of nodes) {
    const index = layers.get(node) ?? 0
    const size = sizes.get(node)!
    widths.set(index, Math.max(widths.get(index) ?? 0, size.width))
    const stacked = heights.get(index)
    heights.set(index, stacked === undefined ? size.height : stacked + GAP_Y + size.height)
  }

  let width = (widths.size - 1) * GAP_X
  for (const value of widths.values()) width += value
  return { width, height: Math.max(...heights.values()) }
}

/**
 * A layered drawing puts every chain of relations on one long row, which wastes the height
 * of the screen. This picks the block pairs whose relations are cheapest to draw as a
 * bracket instead (both ends leave on the same side), so the two blocks may stack and the
 * whole diagram can be shown larger. Diagrams that already fit at full size stay untouched.
 */
export function chooseRelaxedPairs(
  sizes: ReadonlyMap<string, Size>,
  edges: readonly WeightedEdge[],
  viewport: Size,
): Set<string> {
  const relaxed = new Set<string>()
  let hard = [...edges]
  /** Zoom at which a drawing of this size fits the viewport, never above 100%. */
  const fit = (size: Size) =>
    Math.min(
      1,
      viewport.width / Math.max(size.width, 1),
      viewport.height / Math.max(size.height, 1),
    )
  const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0)
  let budget = Math.max(1, Math.floor(totalWeight / 3))

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const currentFit = fit(estimateSize(sizes, hard))
    if (currentFit >= 1) break

    let best: { edge: WeightedEdge; score: number } | null = null
    for (const edge of hard) {
      if (edge.weight > budget) continue
      const trial = estimateSize(
        sizes,
        hard.filter((other) => other !== edge),
      )
      const gain = fit(trial) / currentFit
      if (gain < MIN_GAIN) continue
      const score = (gain - 1) / edge.weight
      if (!best || score > best.score) best = { edge, score }
    }
    if (!best) break

    const chosen = best.edge
    hard = hard.filter((edge) => edge !== chosen)
    relaxed.add(pairKey(chosen.from, chosen.to))
    budget -= chosen.weight
    if (budget <= 0) break
  }
  return relaxed
}
