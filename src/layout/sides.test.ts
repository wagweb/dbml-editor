import { describe, expect, it } from 'vitest'
import { sidesTopDown, type Extent } from './sides'

const extents = (entries: Record<string, number>, width = 200) =>
  new Map<string, Extent>(Object.entries(entries).map(([id, x]) => [id, { x, width }]))

describe('sidesTopDown', () => {
  it('runs from the right edge to the left edge when the lower card sits to the right', () => {
    const sides = sidesTopDown(
      [{ upper: 'users', lower: 'orders' }],
      extents({ users: 0, orders: 400 }),
    )
    expect(sides).toEqual([{ upper: 'E', lower: 'W' }])
  })

  it('mirrors when the lower card sits to the left', () => {
    const sides = sidesTopDown(
      [{ upper: 'users', lower: 'orders' }],
      extents({ users: 400, orders: 0 }),
    )
    expect(sides).toEqual([{ upper: 'W', lower: 'E' }])
  })

  it('keeps the left to right convention for a card straight below', () => {
    const sides = sidesTopDown(
      [{ upper: 'users', lower: 'orders' }],
      extents({ users: 0, orders: 0 }),
    )
    expect(sides).toEqual([{ upper: 'E', lower: 'W' }])
  })

  it('keeps the keys and the foreign keys of a card on opposite edges', () => {
    // orders is referenced by items (left of it) and references users (right of it).
    const links = [
      { upper: 'users', lower: 'orders' },
      { upper: 'orders', lower: 'items' },
    ]
    const sides = sidesTopDown(links, extents({ users: 600, orders: 300, items: 0 }))
    const ordersKeys = sides[1]!.upper
    const ordersForeign = sides[0]!.lower
    expect(ordersKeys).not.toBe(ordersForeign)
    // Both neighbours are best reached the mirrored way round.
    expect(ordersKeys).toBe('W')
    expect(ordersForeign).toBe('E')
  })

  it('weighs all neighbours of a card when they pull different ways', () => {
    const links = [
      { upper: 'users', lower: 'a' },
      { upper: 'users', lower: 'b' },
      { upper: 'users', lower: 'c' },
    ]
    const sides = sidesTopDown(links, extents({ users: 300, a: 0, b: 40, c: 700 }))
    // Two of three neighbours sit left: the keys leave on the left edge.
    expect(new Set(sides.map((s) => s.upper))).toEqual(new Set(['W']))
  })

  it('falls back to the left to right convention without positions', () => {
    const sides = sidesTopDown([{ upper: 'users', lower: 'orders' }], new Map())
    expect(sides).toEqual([{ upper: 'E', lower: 'W' }])
  })

  it('returns nothing for no links', () => {
    expect(sidesTopDown([], new Map())).toEqual([])
  })
})
