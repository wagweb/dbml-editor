import { describe, expect, it } from 'vitest'
import type { RefModel } from '@/dbml/model'
import { orientRefs } from './orient'

let counter = 0
function ref(child: string, parent: string, kind: RefModel['kind'] = 'many-to-one'): RefModel {
  counter += 1
  return {
    id: `r${counter}`,
    kind,
    child: { tableId: child, columns: ['fk'], cardinality: 'many' },
    parent: {
      tableId: parent,
      columns: ['id'],
      cardinality: kind === 'many-to-many' ? 'many' : 'one',
    },
    range: { from: 0, to: 0 },
  }
}

describe('orientRefs', () => {
  it('puts the referenced table on the left', () => {
    const r = ref('orders', 'users')
    const result = orientRefs(['orders', 'users'], [r])
    expect(result.get(r.id)).toEqual({ leftTableId: 'users', rightTableId: 'orders' })
  })

  it('keeps a chain flowing in one direction', () => {
    const a = ref('orders', 'users')
    const b = ref('items', 'orders')
    const result = orientRefs(['items', 'orders', 'users'], [a, b])
    expect(result.get(a.id)?.leftTableId).toBe('users')
    expect(result.get(b.id)?.leftTableId).toBe('orders')
  })

  it('flips exactly one ref of a two table cycle', () => {
    const a = ref('users', 'teams')
    const b = ref('teams', 'users')
    const result = orientRefs(['users', 'teams'], [a, b])
    const lefts = [result.get(a.id)!.leftTableId, result.get(b.id)!.leftTableId]
    expect(new Set(lefts).size).toBe(1)
  })

  it('produces an acyclic left to right order for longer cycles', () => {
    const refs = [ref('b', 'a'), ref('c', 'b'), ref('a', 'c'), ref('d', 'c')]
    const result = orientRefs(['a', 'b', 'c', 'd'], refs)
    const edges = refs.map((r) => result.get(r.id)!)
    expect(hasCycle(edges)).toBe(false)
    const flipped = refs.filter((r) => result.get(r.id)!.leftTableId !== r.parent.tableId)
    expect(flipped).toHaveLength(1)
  })

  it('leaves self references out', () => {
    const r = ref('employees', 'employees')
    expect(orientRefs(['employees'], [r]).has(r.id)).toBe(false)
  })

  it('orients many-to-many refs without creating cycles', () => {
    const refs = [ref('orders', 'users'), ref('users', 'orders', 'many-to-many')]
    const result = orientRefs(['users', 'orders'], refs)
    expect(hasCycle(refs.map((r) => result.get(r.id)!))).toBe(false)
  })

  it('gives all relations between two groups the same direction', () => {
    // users -> workspaces -> memberships is acyclic per table, but cyclic between the
    // "access" group and the ungrouped workspaces table.
    const refs = [
      ref('workspaces', 'users'),
      ref('memberships', 'workspaces'),
      ref('invitations', 'workspaces'),
      ref('memberships', 'users'),
    ]
    const access = new Set(['users', 'memberships', 'invitations'])
    const blockOf = (id: string) => (access.has(id) ? 'access' : id)
    const result = orientRefs(['workspaces', 'users', 'memberships', 'invitations'], refs, blockOf)

    const crossing = refs
      .filter((r) => blockOf(r.child.tableId) !== blockOf(r.parent.tableId))
      .map((r) => blockOf(result.get(r.id)!.leftTableId))
    expect(new Set(crossing).size).toBe(1)
    // The majority direction wins, so only the single opposing relation is flipped.
    expect(crossing[0]).toBe('workspaces')
    expect(hasCycle(refs.map((r) => result.get(r.id)!))).toBe(false)
  })

  it('still orders tables inside a group from referenced to referencing', () => {
    const r = ref('memberships', 'users')
    const result = orientRefs(['memberships', 'users'], [r], () => 'access')
    expect(result.get(r.id)).toEqual({ leftTableId: 'users', rightTableId: 'memberships' })
  })

  it('is deterministic', () => {
    const refs = [ref('b', 'a'), ref('a', 'b'), ref('c', 'a'), ref('a', 'c')]
    const first = orientRefs(['a', 'b', 'c'], refs)
    const second = orientRefs(['a', 'b', 'c'], refs)
    expect([...first.entries()]).toEqual([...second.entries()])
  })
})

function hasCycle(edges: { leftTableId: string; rightTableId: string }[]): boolean {
  const next = new Map<string, string[]>()
  for (const edge of edges) {
    next.set(edge.leftTableId, [...(next.get(edge.leftTableId) ?? []), edge.rightTableId])
  }
  const state = new Map<string, 'open' | 'done'>()
  const visit = (node: string): boolean => {
    if (state.get(node) === 'open') return true
    if (state.get(node) === 'done') return false
    state.set(node, 'open')
    const found = (next.get(node) ?? []).some(visit)
    state.set(node, 'done')
    return found
  }
  return [...next.keys()].some(visit)
}
