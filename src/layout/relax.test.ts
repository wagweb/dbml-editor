import { describe, expect, it } from 'vitest'
import { chooseRelaxedPairs, estimateSize, layersOf, pairKey, type Size } from './relax'

const box: Size = { width: 200, height: 200 }

function sizes(...ids: string[]): Map<string, Size> {
  return new Map(ids.map((id) => [id, box]))
}

describe('layersOf', () => {
  it('puts every node one layer after its latest predecessor', () => {
    const layers = layersOf(
      ['a', 'b', 'c', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    )
    expect(Object.fromEntries(layers)).toEqual({ a: 0, b: 1, c: 2, d: 0 })
  })
})

describe('estimateSize', () => {
  it('places layers side by side and stacks the nodes of a layer', () => {
    const chain = estimateSize(sizes('a', 'b', 'c'), [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ])
    const fan = estimateSize(sizes('a', 'b', 'c'), [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ])
    expect(chain.width).toBeGreaterThan(fan.width)
    expect(chain.height).toBe(200)
    expect(fan.height).toBeGreaterThan(400)
  })

  it('is empty for no nodes', () => {
    expect(estimateSize(new Map(), [])).toEqual({ width: 0, height: 0 })
  })
})

describe('chooseRelaxedPairs', () => {
  const chain = [
    { from: 'a', to: 'b', weight: 1 },
    { from: 'b', to: 'c', weight: 1 },
    { from: 'c', to: 'd', weight: 1 },
  ]

  it('leaves a drawing alone that already fits the viewport', () => {
    expect(
      chooseRelaxedPairs(sizes('a', 'b', 'c', 'd'), chain, { width: 2000, height: 1000 }).size,
    ).toBe(0)
  })

  it('breaks a long chain so that it can wrap into the available height', () => {
    const relaxed = chooseRelaxedPairs(sizes('a', 'b', 'c', 'd'), chain, {
      width: 600,
      height: 600,
    })
    expect(relaxed.size).toBeGreaterThan(0)
    const hard = chain.filter((edge) => !relaxed.has(pairKey(edge.from, edge.to)))
    const before = estimateSize(sizes('a', 'b', 'c', 'd'), chain)
    const after = estimateSize(sizes('a', 'b', 'c', 'd'), hard)
    expect(after.width).toBeLessThan(before.width)
  })

  it('prefers to bend the pair that carries the fewest relations', () => {
    const relaxed = chooseRelaxedPairs(
      sizes('a', 'b', 'c'),
      [
        { from: 'a', to: 'b', weight: 1 },
        { from: 'b', to: 'c', weight: 4 },
        { from: 'a', to: 'c', weight: 4 },
      ],
      { width: 400, height: 400 },
    )
    expect([...relaxed]).toEqual([pairKey('a', 'b')])
  })

  it('never bends more than a third of the relations', () => {
    const edges = [
      { from: 'a', to: 'b', weight: 3 },
      { from: 'b', to: 'c', weight: 3 },
      { from: 'c', to: 'd', weight: 3 },
    ]
    const relaxed = chooseRelaxedPairs(sizes('a', 'b', 'c', 'd'), edges, {
      width: 300,
      height: 600,
    })
    expect(relaxed.size).toBeLessThanOrEqual(1)
  })

  it('does not bend a pair when the blocks stay in different layers anyway', () => {
    // a -> c is implied by a -> b -> c, so relaxing it would change nothing.
    const relaxed = chooseRelaxedPairs(
      sizes('a', 'b', 'c'),
      [
        { from: 'a', to: 'b', weight: 5 },
        { from: 'b', to: 'c', weight: 5 },
        { from: 'a', to: 'c', weight: 1 },
      ],
      { width: 400, height: 400 },
    )
    expect(relaxed.has(pairKey('a', 'c'))).toBe(false)
  })
})
