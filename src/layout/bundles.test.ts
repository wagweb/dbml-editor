import { describe, expect, it } from 'vitest'
import type { RefKind } from '@/dbml/model'
import { bundleEdges, bundleWidth } from './bundles'
import type { EdgeGeometry } from './edges'
import { roundedPath, type Point } from './router'

function edge(
  refId: string,
  points: Point[],
  options: { kind?: RefKind; from?: string; to?: string; startsAtChild?: boolean } = {},
): EdgeGeometry {
  const from = options.from ?? 'users'
  const to = options.to ?? refId
  return {
    refId,
    kind: options.kind ?? 'many-to-one',
    points,
    path: roundedPath(points),
    markers: '',
    start: { tableId: from, column: 'id', point: points[0]!, direction: 1, cardinality: 'one' },
    end: {
      tableId: to,
      column: 'user_id',
      point: points.at(-1)!,
      direction: -1,
      cardinality: 'many',
    },
    startsAtChild: options.startsAtChild ?? false,
  }
}

// Three relations leave users.id at (100, 100) together. At (140, 100) one turns up and two
// turn down; those two part again at (140, 160).
const up = edge('up', [
  { x: 100, y: 100 },
  { x: 140, y: 100 },
  { x: 140, y: 40 },
  { x: 300, y: 40 },
])
const far = edge('far', [
  { x: 100, y: 100 },
  { x: 140, y: 100 },
  { x: 140, y: 200 },
  { x: 300, y: 200 },
])
const near = edge('near', [
  { x: 100, y: 100 },
  { x: 140, y: 100 },
  { x: 140, y: 160 },
  { x: 300, y: 160 },
])

describe('bundleEdges', () => {
  it('finds the stretches relations from one row share, thinning out at each branch', () => {
    const { pieces } = bundleEdges([up, far, near])
    expect(pieces.map((p) => ({ refIds: p.refIds, points: p.points }))).toEqual([
      {
        refIds: ['up', 'far', 'near'],
        points: [
          { x: 100, y: 100 },
          { x: 140, y: 100 },
        ],
      },
      {
        refIds: ['far', 'near'],
        points: [
          { x: 140, y: 100 },
          { x: 140, y: 160 },
        ],
      },
    ])
    expect(pieces[0]!.root).toEqual({ tableId: 'users', column: 'id', referenced: true })
  })

  it('puts a dot where relations part and turns those corners square', () => {
    const { junctions, edges } = bundleEdges([up, far, near])
    expect(junctions.map((j) => ({ point: j.point, refIds: j.refIds }))).toEqual([
      { point: { x: 140, y: 100 }, refIds: ['up', 'far', 'near'] },
      { point: { x: 140, y: 160 }, refIds: ['far', 'near'] },
    ])
    const [bundledUp, bundledFar, bundledNear] = edges
    // Square at the branch, still round where a line bends on its own.
    expect(bundledUp!.path).toBe('M100 100L140 100L140 48Q140 40 148 40L300 40')
    expect(bundledFar!.path).toContain('L140 100L140 192Q140 200 148 200')
    expect(bundledNear!.path).toBe('M100 100L140 100L140 160L300 160')
  })

  it('leaves relations alone that only meet at their row', () => {
    const left = edge('left', [
      { x: 100, y: 100 },
      { x: 60, y: 100 },
    ])
    const right = edge('right', [
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ])
    expect(bundleEdges([left, right])).toEqual({ edges: [left, right], pieces: [], junctions: [] })
  })

  it('also bundles relations whose shared row is at the end of their path', () => {
    const reversed = [up, near].map((e) =>
      edge(e.refId, [...e.points].reverse(), { from: e.refId, to: 'users', startsAtChild: true }),
    )
    const { pieces, junctions } = bundleEdges(reversed)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]!.points).toEqual([
      { x: 100, y: 100 },
      { x: 140, y: 100 },
    ])
    // The path ends at the child, so users is the referenced side.
    expect(pieces[0]!.root.referenced).toBe(true)
    expect(junctions.map((j) => j.point)).toEqual([{ x: 140, y: 100 }])
  })

  it('treats points a fraction of a pixel apart as the same place', () => {
    const shifted = edge('shifted', [
      { x: 100, y: 100 },
      { x: 140.3, y: 100 },
      { x: 140.3, y: 160 },
      { x: 300, y: 160 },
    ])
    const { pieces } = bundleEdges([far, shifted])
    expect(pieces).toHaveLength(1)
    expect(pieces[0]!.refIds).toEqual(['far', 'shifted'])
  })

  it('never bundles enum links or a table that references itself', () => {
    const enumLink = edge('status', up.points, { kind: 'enum' })
    const loop = edge('parent', far.points, { to: 'users' })
    expect(bundleEdges([enumLink, near]).pieces).toEqual([])
    expect(bundleEdges([loop, near]).pieces).toEqual([])
  })
})

describe('bundleWidth', () => {
  it('grows with each relation up to a cap', () => {
    expect(bundleWidth(1)).toBe(1.25)
    expect(bundleWidth(2)).toBe(2)
    expect(bundleWidth(4)).toBe(3.5)
    expect(bundleWidth(12)).toBe(3.5)
  })
})
