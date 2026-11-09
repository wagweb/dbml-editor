import { isTable, type GroupModel, type SchemaModel } from './model'

/** Below this size a schema is readable without any grouping. */
const MIN_TABLES = 8

/**
 * Finds clusters of closely related tables for schemas that define no TableGroups, so a
 * large schema does not end up as one undivided block. Uses the Louvain method: tables
 * move to the neighbouring cluster that raises modularity most, then clusters are merged
 * and the step repeats. The result is deterministic for a given schema.
 */
export function suggestGroups(model: SchemaModel): GroupModel[] {
  const tables = model.tables.filter(isTable)
  if (tables.length < MIN_TABLES) return []

  const index = new Map(tables.map((t, i) => [t.id, i]))
  const links: [number, number][] = []
  for (const ref of model.refs) {
    const a = index.get(ref.child.tableId)
    const b = index.get(ref.parent.tableId)
    if (a !== undefined && b !== undefined && a !== b && ref.kind !== 'enum') links.push([a, b])
  }
  if (links.length === 0) return []

  const community = louvain(tables.length, links)
  const members = new Map<number, number[]>()
  community.forEach((c, node) => members.set(c, [...(members.get(c) ?? []), node]))
  const clusters = [...members.values()].filter((nodes) => nodes.length >= 2)
  // One big cluster says nothing; the suggestion needs at least two.
  if (clusters.length < 2) return []

  const degree = new Array<number>(tables.length).fill(0)
  for (const [a, b] of links) {
    degree[a]! += 1
    degree[b]! += 1
  }
  return clusters.map((nodes): GroupModel => {
    // Named after its best connected table; earlier declaration wins a tie.
    const hub = nodes.reduce((best, node) => (degree[node]! > degree[best]! ? node : best))
    const name = tables[hub]!.name
    return {
      id: `suggested:${tables[hub]!.id}`,
      name,
      tableIds: nodes.map((node) => tables[node]!.id),
      suggested: true,
      range: { from: 0, to: 0 },
    }
  })
}

/** Community index per node. */
function louvain(count: number, links: [number, number][]): number[] {
  let assignment = Array.from({ length: count }, (_, i) => i)
  let nodes = count
  let edges = new Map<string, number>()
  for (const [a, b] of links) addWeight(edges, a, b, 1)

  for (;;) {
    const local = moveNodes(nodes, edges)
    const ids = [...new Set(local)]
    if (ids.length === nodes) break
    const renumber = new Map(ids.map((id, i) => [id, i]))
    const merged = local.map((c) => renumber.get(c)!)
    assignment = assignment.map((c) => merged[c]!)

    const next = new Map<string, number>()
    for (const [key, weight] of edges) {
      const [a, b] = key.split(',').map(Number) as [number, number]
      addWeight(next, merged[a]!, merged[b]!, weight)
    }
    edges = next
    nodes = ids.length
  }
  return assignment
}

function addWeight(edges: Map<string, number>, a: number, b: number, weight: number): void {
  const key = a <= b ? `${a},${b}` : `${b},${a}`
  edges.set(key, (edges.get(key) ?? 0) + weight)
}

/** One Louvain pass: every node joins the neighbouring community with the best gain. */
function moveNodes(count: number, edges: Map<string, number>): number[] {
  const neighbours = Array.from({ length: count }, () => new Map<number, number>())
  const degree = new Array<number>(count).fill(0)
  let total = 0
  for (const [key, weight] of edges) {
    const [a, b] = key.split(',').map(Number) as [number, number]
    total += weight
    if (a === b) {
      degree[a]! += 2 * weight
      continue
    }
    neighbours[a]!.set(b, weight)
    neighbours[b]!.set(a, weight)
    degree[a]! += weight
    degree[b]! += weight
  }

  const community = Array.from({ length: count }, (_, i) => i)
  const communityDegree = [...degree]
  if (total === 0) return community

  for (let moved = true, rounds = 0; moved && rounds < 50; rounds += 1) {
    moved = false
    for (let node = 0; node < count; node += 1) {
      const own = community[node]!
      const toCommunity = new Map<number, number>()
      for (const [neighbour, weight] of neighbours[node]!) {
        const c = community[neighbour]!
        toCommunity.set(c, (toCommunity.get(c) ?? 0) + weight)
      }
      communityDegree[own]! -= degree[node]!

      let best = own
      let bestGain =
        (toCommunity.get(own) ?? 0) - (communityDegree[own]! * degree[node]!) / (2 * total)
      for (const [candidate, weight] of [...toCommunity].sort((x, y) => x[0] - y[0])) {
        const gain = weight - (communityDegree[candidate]! * degree[node]!) / (2 * total)
        if (gain > bestGain + 1e-9) {
          best = candidate
          bestGain = gain
        }
      }
      communityDegree[best]! += degree[node]!
      if (best !== own) {
        community[node] = best
        moved = true
      }
    }
  }
  return community
}
