import { describe, expect, it } from 'vitest'
import { completeDbml, parseDbml } from './parse'

const SHOP = `
Table users as U [headercolor: #3498db] {
  id int [pk, increment]
  email varchar(255) [unique, not null, note: 'Login address']
  team_id int [ref: > teams.id]
  status user_status [default: 'active']
  Note: 'All accounts'
}

Table teams {
  id int [pk]
  owner_id int
}

Table core.orders {
  id int [pk]
  user_id int
  region varchar
  number int
  indexes {
    (region, number) [unique, name: 'order_number']
  }
}

Table profiles {
  user_id int [pk]
  bio text
}

Table tags {
  id int [pk]
}

Enum user_status {
  active
  inactive [note: 'Cannot sign in']
}

Ref order_owner: core.orders.user_id > U.id [delete: cascade]
Ref: profiles.user_id - users.id
Ref: users.id <> tags.id

TableGroup people [color: #ff0000] {
  users
  teams
}
`

function parseOk(source: string) {
  const result = parseDbml(source)
  expect(result.diagnostics).toEqual([])
  if (!result.model) throw new Error('expected a model')
  return result.model
}

describe('parseDbml', () => {
  it('reads tables with their columns in declaration order', () => {
    const model = parseOk(SHOP)
    expect(model.tables.map((t) => t.id)).toEqual([
      'users',
      'teams',
      'core.orders',
      'profiles',
      'tags',
    ])

    const users = model.tables[0]!
    expect(users.alias).toBe('U')
    expect(users.color).toBe('#3498db')
    expect(users.note).toBe('All accounts')
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'email', 'team_id', 'status'])
  })

  it('maps column settings', () => {
    const users = parseOk(SHOP).tables[0]!
    const [id, email, , status] = users.columns
    expect(id).toMatchObject({ pk: true, increment: true, type: 'int' })
    expect(email).toMatchObject({
      type: 'varchar(255)',
      unique: true,
      notNull: true,
      note: 'Login address',
    })
    expect(status?.defaultValue).toBe('active')
  })

  it('keeps schema-qualified tables apart from the default schema', () => {
    const orders = parseOk(SHOP).tables.find((t) => t.id === 'core.orders')!
    expect(orders).toMatchObject({ schema: 'core', name: 'orders' })
  })

  it('orients a many-to-one ref from the referencing child to the referenced parent', () => {
    const model = parseOk(SHOP)
    const inline = model.refs.find(
      (r) => r.child.tableId === 'users' && r.parent.tableId === 'teams',
    )!
    expect(inline.kind).toBe('many-to-one')
    expect(inline.child).toEqual({ tableId: 'users', columns: ['team_id'], cardinality: 'many' })
    expect(inline.parent).toEqual({ tableId: 'teams', columns: ['id'], cardinality: 'one' })
  })

  it('resolves aliases and keeps ref names and actions', () => {
    const ref = parseOk(SHOP).refs.find((r) => r.name === 'order_owner')!
    expect(ref.child.tableId).toBe('core.orders')
    expect(ref.parent.tableId).toBe('users')
    expect(ref.onDelete).toBe('cascade')
  })

  it('treats the primary key side of a one-to-one ref as the parent', () => {
    const model = parseOk(`
      Table users { id int [pk] }
      Table settings { id int [pk]
        user_id int [unique] }
      Ref: users.id - settings.user_id
    `)
    const ref = model.refs[0]!
    expect(ref.kind).toBe('one-to-one')
    expect(ref.parent.tableId).toBe('users')
    expect(ref.child.tableId).toBe('settings')
  })

  it('marks many-to-many refs', () => {
    const ref = parseOk(SHOP).refs.find((r) => r.kind === 'many-to-many')!
    expect(ref.child.cardinality).toBe('many')
    expect(ref.parent.cardinality).toBe('many')
  })

  it('flags foreign key columns on the child side only', () => {
    const model = parseOk(SHOP)
    const column = (tableId: string, name: string) =>
      model.tables.find((t) => t.id === tableId)!.columns.find((c) => c.name === name)!
    expect(column('users', 'team_id').fk).toBe(true)
    expect(column('core.orders', 'user_id').fk).toBe(true)
    expect(column('teams', 'id').fk).toBe(false)
    expect(column('users', 'id').fk).toBe(false)
  })

  it('keeps every column of a composite ref', () => {
    const model = parseOk(`
      Table a { x int
        y int
        indexes { (x, y) [pk] } }
      Table b { ax int
        ay int }
      Ref: b.(ax, ay) > a.(x, y)
    `)
    expect(model.refs[0]!.child.columns).toEqual(['ax', 'ay'])
    expect(model.refs[0]!.parent.columns).toEqual(['x', 'y'])
  })

  it('marks composite primary keys declared through indexes', () => {
    const model = parseOk(`
      Table a { x int
        y int
        z int
        indexes { (x, y) [pk] } }
    `)
    expect(model.tables[0]!.columns.map((c) => c.pk)).toEqual([true, true, false])
  })

  it('reads indexes', () => {
    const orders = parseOk(SHOP).tables.find((t) => t.id === 'core.orders')!
    expect(orders.indexes).toEqual([
      { columns: ['region', 'number'], unique: true, pk: false, name: 'order_number' },
    ])
  })

  it('links enum typed columns to their enum', () => {
    const model = parseOk(SHOP)
    const status = model.tables[0]!.columns.find((c) => c.name === 'status')!
    expect(status.enumId).toBe('user_status')
    expect(model.enums[0]!.values).toEqual([
      { name: 'active' },
      { name: 'inactive', note: 'Cannot sign in' },
    ])
  })

  it('assigns tables to their group', () => {
    const model = parseOk(SHOP)
    expect(model.groups).toHaveLength(1)
    expect(model.groups[0]).toMatchObject({
      name: 'people',
      color: '#ff0000',
      tableIds: ['users', 'teams'],
    })
    expect(model.tables.find((t) => t.id === 'users')!.groupId).toBe(model.groups[0]!.id)
    expect(model.tables.find((t) => t.id === 'tags')!.groupId).toBeUndefined()
  })

  it('keeps self references', () => {
    const model = parseOk(`
      Table employees { id int [pk]
        manager_id int [ref: > employees.id] }
    `)
    const ref = model.refs[0]!
    expect(ref.child.tableId).toBe('employees')
    expect(ref.parent.tableId).toBe('employees')
  })

  it('gives refs stable, unique ids', () => {
    const model = parseOk(SHOP)
    const ids = model.refs.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(parseOk(SHOP).refs.map((r) => r.id)).toEqual(ids)
  })

  it('records where each table and column lives in the source', () => {
    const source = 'Table users {\n  id int [pk]\n}\n'
    const table = parseOk(source).tables[0]!
    expect(source.slice(table.range.from, table.range.to)).toBe('Table users {\n  id int [pk]\n}')
    expect(source.slice(table.columns[0]!.range.from, table.columns[0]!.range.to)).toBe(
      'id int [pk]',
    )
  })

  it('reads project settings', () => {
    const model = parseOk(`Project shop { database_type: 'PostgreSQL' }\nTable a { id int }`)
    expect(model.project).toEqual({ name: 'shop', databaseType: 'PostgreSQL' })
  })

  it('returns an empty model for empty input', () => {
    const model = parseOk('')
    expect(model.tables).toEqual([])
    expect(model.refs).toEqual([])
  })

  it('reports problems with source offsets and no model', () => {
    const source = 'Table users {\n  id int [pk\n}\n'
    const result = parseDbml(source)
    expect(result.model).toBeNull()
    expect(result.diagnostics.length).toBeGreaterThan(0)
    const first = result.diagnostics[0]!
    expect(first.severity).toBe('error')
    expect(first.message).toMatch(/\S/)
    expect(first.from).toBeGreaterThanOrEqual(0)
    expect(first.to).toBeGreaterThanOrEqual(first.from)
    expect(first.to).toBeLessThanOrEqual(source.length)
  })

  it('does not repeat the same problem twice', () => {
    const result = parseDbml('Table a { id int }\nRef: missing.id > a.id\n')
    const keys = result.diagnostics.map((d) => `${d.from}:${d.to}:${d.message}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('table partials', () => {
  const model = parseDbml(`
    TablePartial audit [headercolor: #ff0000] {
      created_at timestamp [not null]
      created_by int [ref: > users.id]
      name varchar(10)
      indexes { created_at }
    }
    Table users {
      id int [pk]
      ~audit
      name varchar(200)
    }
    Table posts {
      id int [pk]
      ~audit
    }
  `).model!
  const users = model.tables.find((t) => t.id === 'users')!
  const posts = model.tables.find((t) => t.id === 'posts')!

  it('injects the partial columns at the position of the reference', () => {
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'created_at', 'created_by', 'name'])
    expect(posts.columns.map((c) => c.name)).toEqual(['id', 'created_at', 'created_by', 'name'])
  })

  it('lets a column defined in the table win over the partial', () => {
    expect(users.columns.find((c) => c.name === 'name')!.type).toBe('varchar(200)')
    expect(posts.columns.find((c) => c.name === 'name')!.type).toBe('varchar(10)')
  })

  it('carries over colour and indexes', () => {
    expect(posts.color).toBe('#ff0000')
    expect(posts.indexes).toEqual([{ columns: ['created_at'], unique: false, pk: false }])
  })

  it('creates a relation for every table that injects a partial with an inline ref', () => {
    const pairs = model.refs.map(
      (r) => `${r.child.tableId}.${r.child.columns[0]}>${r.parent.tableId}`,
    )
    expect(pairs.sort()).toEqual(['posts.created_by>users', 'users.created_by>users'])
    expect(posts.columns.find((c) => c.name === 'created_by')!.fk).toBe(true)
  })
})

describe('completeDbml', () => {
  const source = 'Table teams {\n  id int [pk]\n  title varchar\n}\nRef: teams.'

  it('suggests the columns of the table before the cursor', () => {
    const items = completeDbml(source, source.length)
    expect(items.map((i) => i.label)).toEqual(['id', 'title'])
    expect(items.every((i) => i.kind === 'column')).toBe(true)
  })

  it('suggests column settings inside brackets', () => {
    const text = 'Table teams {\n  id int [p]\n}'
    const labels = completeDbml(text, text.indexOf('p]') + 1).map((i) => i.label)
    expect(labels).toContain('pk')
    expect(labels).toContain('not null')
  })

  it('keeps working for the next parse', () => {
    completeDbml(source, source.length)
    expect(parseDbml('Table a { id int }').model?.tables).toHaveLength(1)
  })
})

describe('review regressions', () => {
  it('takes colour and note from the last partial that defines them', () => {
    const model = parseDbml(`
      TablePartial tinted [headercolor: #00ff00] { a int
        Note: 'from tinted' }
      TablePartial plain { b int }
      Table t { id int
        ~tinted
        ~plain }
    `).model!
    expect(model.tables[0]).toMatchObject({ color: '#00ff00', note: 'from tinted' })
  })

  it('creates one relation when two partials define the same referencing column', () => {
    const model = parseDbml(`
      Table users { id int [pk] }
      Table teams { id int [pk] }
      TablePartial first { owner_id int [ref: > users.id] }
      TablePartial second { owner_id int [ref: > teams.id] }
      Table t { id int
        ~first
        ~second }
    `).model!
    expect(model.refs.map((r) => r.parent.tableId)).toEqual(['teams'])
  })

  it('keeps a quoted name with a dot apart from a schema qualified table', () => {
    const model = parseDbml(`
      Table "a.b" { id int }
      Table a.b { id int }
    `).model!
    expect(new Set(model.tables.map((t) => t.id)).size).toBe(2)
  })
})
