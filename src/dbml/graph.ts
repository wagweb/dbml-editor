import type { SchemaModel } from './model'

/** Tables each table is directly related to, in either direction. */
export function adjacency(model: SchemaModel): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>(model.tables.map((t) => [t.id, new Set()]))
  for (const ref of model.refs) {
    const a = ref.child.tableId
    const b = ref.parent.tableId
    if (a === b) continue
    neighbours.get(a)?.add(b)
    neighbours.get(b)?.add(a)
  }
  return neighbours
}

/**
 * Shortest chain of related tables from one table to another, both ends included.
 * Null when the two are not connected at all.
 */
export function shortestPath(model: SchemaModel, from: string, to: string): string[] | null {
  const neighbours = adjacency(model)
  if (!neighbours.has(from) || !neighbours.has(to)) return null
  if (from === to) return [from]

  const previous = new Map<string, string>()
  const queue = [from]
  const seen = new Set([from])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    for (const next of neighbours.get(current) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      previous.set(next, current)
      if (next === to) {
        const path = [to]
        for (let step = previous.get(to); step !== undefined; step = previous.get(step)) {
          path.unshift(step)
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

/** Every table within the given number of relation steps, with its distance. */
export function withinSteps(model: SchemaModel, from: string, steps: number): Map<string, number> {
  const neighbours = adjacency(model)
  const distance = new Map<string, number>()
  if (!neighbours.has(from)) return distance
  distance.set(from, 0)
  const queue = [from]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    const next = distance.get(current)! + 1
    if (next > steps) continue
    for (const neighbour of neighbours.get(current) ?? []) {
      if (distance.has(neighbour)) continue
      distance.set(neighbour, next)
      queue.push(neighbour)
    }
  }
  return distance
}
