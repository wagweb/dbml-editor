import type { RefModel } from '@/dbml/model'

export interface Orientation {
  /** Table drawn on the left end of the relation. */
  leftTableId: string
  rightTableId: string
}

/**
 * Decides the reading direction of every relation: referenced tables go left, the tables
 * that reference them go right. Cycles are broken by flipping as few relations as possible
 * (greedy feedback arc set after Eades, Lin and Smyth), so the layered layout gets a DAG.
 *
 * Tables that share a block (a table group) are laid out as one unit. Blocks are therefore
 * ordered first and relations between blocks follow that order; otherwise two groups that
 * reference each other would force relations to loop around the whole diagram.
 */
export function orientRefs(
  tableIds: readonly string[],
  refs: readonly RefModel[],
  blockOf: (tableId: string) => string = (tableId) => tableId,
): Map<string, Orientation> {
  const directed = refs.filter(
    (r) => r.kind !== 'many-to-many' && r.child.tableId !== r.parent.tableId,
  )

  const blocks = [...new Set(tableIds.map(blockOf))]
  const blockRank = sequence(
    blocks,
    directed
      .map((r): [string, string] => [blockOf(r.parent.tableId), blockOf(r.child.tableId)])
      .filter(([from, to]) => from !== to),
  )
  const tableRank = sequence(
    tableIds,
    directed.map((r) => [r.parent.tableId, r.child.tableId]),
  )
  const rank = (tableId: string): [number, number] => [
    blockRank.get(blockOf(tableId)) ?? 0,
    tableRank.get(tableId) ?? 0,
  ]

  const result = new Map<string, Orientation>()
  for (const ref of refs) {
    const parent = ref.parent.tableId
    const child = ref.child.tableId
    if (parent === child) continue
    const [parentBlock, parentTable] = rank(parent)
    const [childBlock, childTable] = rank(child)
    const parentFirst =
      parentBlock !== childBlock ? parentBlock < childBlock : parentTable <= childTable
    result.set(
      ref.id,
      parentFirst
        ? { leftTableId: parent, rightTableId: child }
        : { leftTableId: child, rightTableId: parent },
    )
  }
  return result
}

/** Linear order of the nodes that leaves few edges pointing backwards. */
function sequence(nodes: readonly string[], edges: [string, string][]): Map<string, number> {
  const outgoing = new Map<string, Map<string, number>>()
  const incoming = new Map<string, Map<string, number>>()
  for (const node of nodes) {
    outgoing.set(node, new Map())
    incoming.set(node, new Map())
  }
  for (const [from, to] of edges) {
    const out = outgoing.get(from)
    const inc = incoming.get(to)
    if (!out || !inc) continue
    out.set(to, (out.get(to) ?? 0) + 1)
    inc.set(from, (inc.get(from) ?? 0) + 1)
  }

  const remaining = new Set(nodes)
  const weight = (links: Map<string, number> | undefined) => {
    let total = 0
    for (const [node, count] of links ?? []) if (remaining.has(node)) total += count
    return total
  }

  const head: string[] = []
  const tail: string[] = []
  const take = (node: string, target: string[]) => {
    remaining.delete(node)
    target.push(node)
  }

  while (remaining.size > 0) {
    let progressed = true
    while (progressed) {
      progressed = false
      // Declaration order keeps the result stable; sinks are peeled from the end.
      for (const node of [...nodes].reverse()) {
        if (remaining.has(node) && weight(outgoing.get(node)) === 0) {
          take(node, tail)
          progressed = true
        }
      }
      for (const node of nodes) {
        if (remaining.has(node) && weight(incoming.get(node)) === 0) {
          take(node, head)
          progressed = true
        }
      }
    }

    let best: string | undefined
    let bestScore = -Infinity
    for (const node of nodes) {
      if (!remaining.has(node)) continue
      const score = weight(outgoing.get(node)) - weight(incoming.get(node))
      if (score > bestScore) {
        best = node
        bestScore = score
      }
    }
    if (best !== undefined) take(best, head)
  }

  const order = [...head, ...tail.reverse()]
  return new Map(order.map((node, index) => [node, index]))
}
