// Types only: elk.ts calls this module, so a value import from there would be a cycle.
import type { Side } from './elk'

/** Horizontal extent of a placed card. */
export interface Extent {
  x: number
  width: number
}

export interface VerticalLink {
  /** Referenced end, placed above the other one (or beside it, for a bracket). */
  upper: string
  /** Referencing end. */
  lower: string
}

export interface LinkSides {
  upper: Side
  lower: Side
}

/**
 * Edges for relations in a top to bottom layout, where a relation still attaches to the
 * left or right edge of its row. Every card keeps the lines of its keys (the referenced
 * end) on one edge and the lines of its foreign keys on the other, so the lines going down
 * and the lines coming from above never cross beside the card. Which edge is which is
 * decided per card from where its neighbours were placed, so few lines have to double back
 * across a card's width. Ties keep the left to right convention: keys on the right edge.
 */
export function sidesTopDown(
  links: readonly VerticalLink[],
  extents: ReadonlyMap<string, Extent>,
): LinkSides[] {
  const below = new Map<string, string[]>()
  const above = new Map<string, string[]>()
  const add = (map: Map<string, string[]>, card: string, neighbour: string) =>
    map.set(card, [...(map.get(card) ?? []), neighbour])
  for (const link of links) {
    add(below, link.upper, link.lower)
    add(above, link.lower, link.upper)
  }

  const keySide = new Map<string, Side>()
  const foreignSide = new Map<string, Side>()
  for (const card of new Set(links.flatMap((link) => [link.upper, link.lower]))) {
    const keys = (side: Side) => detours(card, below.get(card), side, extents)
    const foreign = (side: Side) => detours(card, above.get(card), side, extents)
    if (below.has(card) && above.has(card)) {
      const keysRight = keys('E') + foreign('W') <= keys('W') + foreign('E')
      keySide.set(card, keysRight ? 'E' : 'W')
      foreignSide.set(card, keysRight ? 'W' : 'E')
    } else if (below.has(card)) {
      keySide.set(card, keys('E') <= keys('W') ? 'E' : 'W')
    } else {
      foreignSide.set(card, foreign('W') <= foreign('E') ? 'W' : 'E')
    }
  }

  return links.map((link) => ({
    upper: keySide.get(link.upper) ?? 'E',
    lower: foreignSide.get(link.lower) ?? 'W',
  }))
}

/** How far lines leaving `card` on `side` have to come back to reach their neighbours. */
function detours(
  card: string,
  neighbours: readonly string[] | undefined,
  side: Side,
  extents: ReadonlyMap<string, Extent>,
): number {
  const own = extents.get(card)
  if (!own || !neighbours) return 0
  let total = 0
  for (const neighbour of neighbours) {
    const other = extents.get(neighbour)
    if (!other) continue
    total +=
      side === 'E'
        ? Math.max(0, own.x + own.width - other.x)
        : Math.max(0, other.x + other.width - own.x)
  }
  return total
}
