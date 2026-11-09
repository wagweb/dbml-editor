import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import { isTable } from '@/dbml/model'
import { parseDbml } from '@/dbml/parse'
import { SAMPLES } from '@/test/schemas'
import { foreignKeysByTable, toMermaid } from './mermaid'

function parse(source: string) {
  const result = parseDbml(source)
  expect(result.diagnostics).toEqual([])
  return result.model!
}

function mermaidOf(source: string): string {
  return toMermaid(parse(source))
}

/** Entity declarations: two spaces, then a name and an optional opening brace. */
function entityNames(mermaid: string): string[] {
  return [...mermaid.matchAll(/^ {2}([^\s{}]+)(?: \{)?$/gm)].map((match) => match[1] ?? '')
}

function attributeLines(mermaid: string): string[] {
  return mermaid
    .split('\n')
    .filter((line) => line.startsWith('    '))
    .map((line) => line.trim())
}

function relationLines(mermaid: string): string[] {
  return mermaid
    .split('\n')
    .filter((line) => / : /.test(line))
    .map((line) => line.trim())
}

describe('toMermaid', () => {
  it('writes entities with typed attributes, keys and comments, then the relations', () => {
    const mermaid = mermaidOf(`
      Table customers {
        id int [pk]
        email varchar(255) [unique, note: 'Login name']
      }
      Table orders {
        id int [pk]
        customer_id int [not null, ref: > customers.id]
      }
    `)
    expect(mermaid).toBe(
      [
        'erDiagram',
        '  customers {',
        '    int id PK',
        '    varchar(255) email UK "Login name"',
        '  }',
        '  orders {',
        '    int id PK',
        '    int customer_id FK',
        '  }',
        '  customers ||--o{ orders : customer_id',
        '',
      ].join('\n'),
    )
  })

  it('turns table names into unique Mermaid entity names', () => {
    const mermaid = mermaidOf(`
      Table sales.orders { id int [pk] }
      Table sales_orders { id int [pk] }
      Table "sales orders" { id int [pk] }
      Table "2fa codes" { id int [pk] }
      Table "größe" { id int [pk] }
      Table "end" { id int [pk] }
      Table "u-turns" { id int [pk] }
      Table "to-do" { id int [pk] }
      Table tokens { id int [pk] }
    `)
    expect(entityNames(mermaid)).toEqual([
      'sales_orders',
      'sales_orders_2',
      'sales_orders_3',
      '_2fa_codes',
      'gr__e',
      // Mermaid reads these as keywords or relation markers, so they get a leading underscore.
      '_end',
      '_u-turns',
      '_to-do',
      'tokens',
    ])
  })

  it('keeps relations pointing at the renamed entities', () => {
    const mermaid = mermaidOf(`
      Table sales.orders { id int [pk] }
      Table sales_orders { order_id int [not null, ref: > sales.orders.id] }
    `)
    expect(relationLines(mermaid)).toEqual(['sales_orders ||--o{ sales_orders_2 : order_id'])
  })

  it('reduces types and column names to characters Mermaid accepts', () => {
    const mermaid = mermaidOf(`
      Enum billing.kind { a }
      Table t {
        amount decimal(10,2)
        label "character varying"
        tags int[]
        "unit price" int
        "2nd line" text
        "pk" int
        kind billing.kind
      }
    `)
    expect(attributeLines(mermaid)).toEqual([
      'decimal(10_2) amount',
      'character_varying label',
      'int[] tags',
      'int unit_price',
      'text _2nd_line',
      // A bare `pk` would be read as a key marker.
      'int _pk',
      'billing_kind kind',
    ])
  })

  it('combines primary, foreign and unique keys', () => {
    const mermaid = mermaidOf(`
      Table users {
        id int [pk]
        email varchar [unique]
        name varchar
      }
      Table profiles {
        user_id int [pk, ref: - users.id]
        referrer_id int [unique, ref: > users.id]
      }
      Table tags { id int [pk, unique] }
      Table user_tags { user_id int }
      Ref: user_tags.user_id <> tags.id
    `)
    expect(attributeLines(mermaid)).toEqual([
      'int id PK',
      'varchar email UK',
      'varchar name',
      'int user_id PK, FK',
      'int referrer_id FK, UK',
      'int id PK, UK',
      // The child of a many-to-many relation still points at another table.
      'int user_id FK',
    ])
  })

  it('writes column notes as comments without double quotes or line breaks', () => {
    const mermaid = mermaidOf(`
      Table t {
        a int [note: 'He said "hi"']
        b int [note: '''
          first line
          second line
        ''']
        c int [note: '']
      }
    `)
    expect(attributeLines(mermaid)).toEqual([
      `int a "He said 'hi'"`,
      'int b "first line second line"',
      'int c',
    ])
  })

  it('draws every kind of relation with the child on the right', () => {
    const mermaid = mermaidOf(`
      Table customers { id int [pk] }
      Table coupons { id int [pk] }
      Table orders {
        id int [pk]
        customer_id int [not null, ref: > customers.id]
        coupon_id int [ref: > coupons.id]
      }
      Table invoices { order_id int [pk, ref: - orders.id] }
      Table tags { id int [pk] }
      Table order_tags { tag_id int [not null] }
      Table categories {
        id int [pk]
        parent_id int [ref: > categories.id]
      }
      Ref: order_tags.tag_id <> tags.id
    `)
    expect(relationLines(mermaid)).toEqual([
      'customers ||--o{ orders : customer_id',
      'coupons |o--o{ orders : coupon_id',
      'orders ||--o| invoices : order_id',
      'categories |o--o{ categories : parent_id',
      'tags }o--o{ order_tags : tag_id',
    ])
  })

  it('labels composite keys with a quoted list and checks every column for null', () => {
    const mermaid = mermaidOf(`
      Table a {
        x int
        y int
        indexes { (x, y) [pk] }
      }
      Table b {
        ax int [not null]
        ay int [not null]
      }
      Table c {
        ax int [not null]
        ay int
      }
      Table d {
        ax int
        ay int
        indexes { (ax, ay) [pk] }
      }
      Ref: b.(ax, ay) > a.(x, y)
      Ref: c.(ax, ay) > a.(x, y)
      Ref: d.(ax, ay) > a.(x, y)
    `)
    expect(relationLines(mermaid)).toEqual([
      'a ||--o{ b : "ax, ay"',
      'a |o--o{ c : "ax, ay"',
      // Primary key columns are never null, even without `not null`.
      'a ||--o{ d : "ax, ay"',
    ])
  })

  it('quotes a single column label that is not a plain Mermaid word', () => {
    const mermaid = mermaidOf(`
      Table items { id int [pk] }
      Table lines {
        "item id" int [not null, ref: > items.id]
        "end" int [not null, ref: > items.id]
      }
    `)
    expect(relationLines(mermaid)).toEqual([
      'items ||--o{ lines : "item id"',
      'items ||--o{ lines : "end"',
    ])
  })

  it('declares a table without columns by its bare name', () => {
    // The parser insists on a column, so the empty table is cut from a parsed one.
    const model = parse('Table logs { id int [pk] }\nTable users { id int [pk] }')
    const withEmptyTable = {
      ...model,
      tables: model.tables.map((t) => (t.name === 'logs' ? { ...t, columns: [] } : t)),
    }
    expect(toMermaid(withEmptyTable)).toBe('erDiagram\n  logs\n  users {\n    int id PK\n  }\n')
  })

  it('leaves out enum cards, note cards and enum links of the drawn model', () => {
    const model = parse(`
      Table users {
        id int [pk]
        status user_status
      }
      Enum user_status { active }
      Note todo { 'Document this' }
    `)
    const shown = shownModel(model, { view: null, enums: true, suggestGroups: false })
    expect(shown.tables.filter((t) => !isTable(t))).toHaveLength(2)
    expect(shown.refs.some((r) => r.kind === 'enum')).toBe(true)
    expect(toMermaid(shown)).toBe(toMermaid(model))
    expect(foreignKeysByTable(shown).size).toBe(0)
  })

  it('writes every table and relation of the storefront sample', () => {
    const sample = SAMPLES.find((s) => s.id === 'storefront')!
    const model = parse(sample.source)
    const mermaid = toMermaid(model)
    expect(mermaid.startsWith('erDiagram\n')).toBe(true)
    expect(mermaid.endsWith('\n') && !mermaid.endsWith('\n\n')).toBe(true)
    expect(entityNames(mermaid)).toEqual(model.tables.map((t) => t.name))
    expect(relationLines(mermaid)).toHaveLength(model.refs.length)
    expect(relationLines(mermaid)).toContain('orders ||--o| shipments : order_id')
  })
})
