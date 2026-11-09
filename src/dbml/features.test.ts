import { describe, expect, it } from 'vitest'
import { suggestGroups } from './communities'
import { enumCardId, noteCardId, shownModel, type ShowOptions } from './derive'
import { shortestPath, withinSteps } from './graph'
import { schemaHints } from './hints'
import { isTable } from './model'
import { parseDbml } from './parse'
import { SAMPLES } from './samples'

function parse(source: string) {
  const result = parseDbml(source)
  expect(result.diagnostics).toEqual([])
  return result.model!
}

const SHOP = `
Table customers { id int [pk]
  country_code char(2) [ref: > countries.code]
  status customer_status }
Table countries { code char(2) [pk] }
Table orders { id int [pk]
  customer_id int [ref: > customers.id] }
Table order_items { id int [pk]
  order_id int [ref: > orders.id] }
Table logs { id int [pk] }
Table core.audits { id int [pk] }
Enum customer_status { active
  blocked [note: 'cannot sign in'] }
Enum unused_kind { a }
TableGroup sales { orders
  order_items }
Note reminder { 'Check retention' }
Records customers(id, country_code) {
  1, 'DE'
  2, null
}
DiagramView selling { Tables { orders
  order_items
  customers } }
DiagramView by_group { TableGroups { sales } }
DiagramView by_schema { Schemas { core } }
DiagramView everything { Tables { * } }
`

describe('parsing of the remaining DBML elements', () => {
  const model = parse(SHOP)

  it('reads sticky notes', () => {
    expect(model.notes).toMatchObject([{ name: 'reminder', content: 'Check retention' }])
  })

  it('reads sample rows', () => {
    expect(model.records).toEqual([
      {
        tableId: 'customers',
        columns: ['id', 'country_code'],
        rows: [
          [1, 'DE'],
          [2, null],
        ],
      },
    ])
  })

  it('resolves what each diagram view shows', () => {
    const view = (name: string) => model.views.find((v) => v.name === name)!.tableIds
    expect(view('selling')).toEqual(['customers', 'orders', 'order_items'])
    expect(view('by_group')).toEqual(['orders', 'order_items'])
    expect(view('by_schema')).toEqual(['core.audits'])
    expect(view('everything')).toHaveLength(6)
  })
})

describe('relation paths', () => {
  const model = parse(SHOP)

  it('finds the shortest chain between two tables', () => {
    expect(shortestPath(model, 'order_items', 'countries')).toEqual([
      'order_items',
      'orders',
      'customers',
      'countries',
    ])
    expect(shortestPath(model, 'countries', 'order_items')?.at(0)).toBe('countries')
  })

  it('handles the trivial and the impossible case', () => {
    expect(shortestPath(model, 'orders', 'orders')).toEqual(['orders'])
    expect(shortestPath(model, 'orders', 'logs')).toBeNull()
    expect(shortestPath(model, 'orders', 'missing')).toBeNull()
  })

  it('collects the tables within a number of steps', () => {
    expect(Object.fromEntries(withinSteps(model, 'orders', 1))).toEqual({
      orders: 0,
      customers: 1,
      order_items: 1,
    })
    expect(withinSteps(model, 'orders', 2).get('countries')).toBe(2)
    expect(withinSteps(model, 'orders', 2).has('logs')).toBe(false)
  })
})

describe('shownModel', () => {
  const model = parse(SHOP)
  const plain: ShowOptions = { view: null, enums: false, suggestGroups: false }

  it('leaves the schema alone when nothing is asked for', () => {
    const shown = shownModel(model, plain)
    expect(shown.tables.filter(isTable)).toHaveLength(6)
    expect(shown.refs).toHaveLength(model.refs.length)
  })

  it('restricts tables, relations and groups to a view', () => {
    const shown = shownModel(model, { ...plain, view: 'selling' })
    expect(shown.tables.map((t) => t.id)).toEqual(['customers', 'orders', 'order_items'])
    // customers -> countries leaves the view, so that relation is dropped.
    expect(shown.refs.map((r) => r.parent.tableId).sort()).toEqual(['customers', 'orders'])
    expect(shown.groups[0]!.tableIds).toEqual(['orders', 'order_items'])
  })

  it('ignores a view that does not exist', () => {
    expect(shownModel(model, { ...plain, view: 'gone' }).tables).toHaveLength(7)
  })

  it('adds enums as cards and links the columns that use them', () => {
    const shown = shownModel(model, { ...plain, enums: true })
    const card = shown.tables.find((t) => t.id === enumCardId('customer_status'))!
    expect(card.kind).toBe('enum')
    expect(card.columns.map((c) => c.name)).toEqual(['active', 'blocked'])
    expect(shown.tables.some((t) => t.id === enumCardId('unused_kind'))).toBe(true)
    const link = shown.refs.find((r) => r.kind === 'enum')!
    expect(link.child).toMatchObject({ tableId: 'customers', columns: ['status'] })
    expect(link.parent.tableId).toBe(enumCardId('customer_status'))
  })

  it('brings only the enums a view uses into the view', () => {
    const inView = shownModel(model, { ...plain, view: 'selling', enums: true })
    expect(inView.tables.some((t) => t.id === enumCardId('customer_status'))).toBe(true)
    expect(inView.tables.some((t) => t.id === enumCardId('unused_kind'))).toBe(false)
  })

  it('adds sticky notes as cards, but not inside a view', () => {
    expect(shownModel(model, plain).tables.at(-1)).toMatchObject({
      id: noteCardId('reminder'),
      kind: 'note',
      text: 'Check retention',
    })
    const inView = shownModel(model, { ...plain, view: 'selling' })
    expect(inView.tables.some((t) => t.kind === 'note')).toBe(false)
  })
})

describe('suggestGroups', () => {
  const stripGroups = (source: string) => source.replace(/TableGroup[^{]*\{[^}]*\}/g, '')

  it('finds several clusters in a larger schema without groups', () => {
    const model = parse(stripGroups(SAMPLES.find((s) => s.id === 'saas')!.source))
    const groups = suggestGroups(model)
    expect(groups.length).toBeGreaterThanOrEqual(2)
    expect(groups.every((g) => g.suggested && g.tableIds.length >= 2)).toBe(true)
    // Every table belongs to at most one suggestion.
    const all = groups.flatMap((g) => g.tableIds)
    expect(new Set(all).size).toBe(all.length)
    // Tables that only relate to each other end up together.
    const groupOf = (id: string) => groups.find((g) => g.tableIds.includes(id))?.id
    expect(groupOf('roles')).toBe(groupOf('role_permissions'))
    expect(groupOf('task_comments')).toBe(groupOf('tasks'))
  })

  it('names a cluster after its best connected table', () => {
    const model = parse(stripGroups(SAMPLES.find((s) => s.id === 'saas')!.source))
    for (const group of suggestGroups(model)) {
      expect(group.tableIds).toContain(group.id.replace('suggested:', ''))
    }
  })

  it('stays quiet for small schemas and is deterministic', () => {
    expect(suggestGroups(parse(SHOP))).toEqual([])
    const model = parse(stripGroups(SAMPLES.find((s) => s.id === 'saas')!.source))
    expect(suggestGroups(model)).toEqual(suggestGroups(model))
  })

  it('is applied by shownModel only when the schema has no groups of its own', () => {
    const saas = SAMPLES.find((s) => s.id === 'saas')!.source
    const options: ShowOptions = { view: null, enums: false, suggestGroups: true }
    expect(shownModel(parse(saas), options).groups.some((g) => g.suggested)).toBe(false)
    const flat = shownModel(parse(stripGroups(saas)), options)
    expect(flat.groups.every((g) => g.suggested)).toBe(true)
    expect(flat.tables.find((t) => t.id === 'tasks')!.groupId).toMatch(/^suggested:/)
  })
})

describe('schemaHints', () => {
  const hints = schemaHints(
    parse(`
      Table users { id uuid [pk]
        display_name varchar
        team_id int [ref: > teams.id]
        createdAt timestamp }
      Table teams { id int [pk]
        owner_id int [unique, ref: - users.id] }
      Table events { name varchar
        user_id uuid [ref: > users.id]
        team_id int [ref: > teams.id]
        indexes { team_id } }
      Table order_lines { order_id int [pk] }
    `),
  )
  const messages = hints.map((h) => h.message)

  it('points out tables without a primary key', () => {
    expect(messages).toContain('Table events has no primary key')
    expect(messages.some((m) => m.includes('order_lines'))).toBe(false)
  })

  it('points out foreign keys that no index covers', () => {
    expect(messages).toContain('users.team_id is a foreign key without an index')
    expect(messages).toContain('events.user_id is a foreign key without an index')
    // Covered by an index and by a unique column respectively.
    expect(messages.some((m) => m.startsWith('events.team_id is a foreign key'))).toBe(false)
    expect(messages.some((m) => m.startsWith('teams.owner_id is a foreign key'))).toBe(false)
  })

  it('points out references between different types', () => {
    expect(messages).toContain('teams.owner_id is int, but users.id is uuid')
    expect(messages.some((m) => m.startsWith('events.user_id is uuid, but'))).toBe(false)
  })

  it('points out names that break the prevailing style', () => {
    expect(messages).toContain('users.createdAt is camelCase, most names here are snake_case')
  })

  it('locates every hint in the source', () => {
    for (const hint of hints) {
      expect(hint.range.to).toBeGreaterThan(hint.range.from)
      expect(hint.tableId).toBeTruthy()
    }
  })

  it('has nothing to say about a tidy schema', () => {
    expect(
      schemaHints(
        parse(`Table a { id int [pk] }
          Table b { id int [pk]
            a_id int [ref: > a.id]
            indexes { a_id } }`),
      ),
    ).toEqual([])
  })
})
