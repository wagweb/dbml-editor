import { describe, expect, it } from 'vitest'
import { joinQuery } from './joinQuery'
import { parseDbml } from './parse'

function model(source: string) {
  const parsed = parseDbml(source).model
  if (!parsed) throw new Error('test schema does not parse')
  return parsed
}

const SHOP = model(`
Table countries {
  code char(2) [pk]
}
Table customers {
  id int [pk]
  country_code char(2) [ref: > countries.code]
}
Table orders {
  id int [pk]
  customer_id int [ref: > customers.id]
  updated_by int [ref: > customers.id]
}
Table order_items {
  order_id int [ref: > orders.id]
  product_id int
}
`)

describe('joinQuery', () => {
  it('joins along the path with the new table first in each condition', () => {
    expect(joinQuery(SHOP, ['order_items', 'orders', 'customers', 'countries'])).toBe(
      [
        'SELECT *',
        'FROM order_items oi',
        'JOIN orders o ON o.id = oi.order_id',
        '-- Also related through orders.updated_by',
        'JOIN customers c ON c.id = o.customer_id',
        'JOIN countries co ON co.code = c.country_code;',
        '',
      ].join('\n'),
    )
  })

  it('walks a relation from the referenced side as well', () => {
    expect(joinQuery(SHOP, ['countries', 'customers'])).toBe(
      'SELECT *\nFROM countries c\nJOIN customers cu ON cu.country_code = c.code;\n',
    )
  })

  it('quotes reserved and unusual names and qualifies other schemas', () => {
    const schema = model(`
Table "user" {
  id int [pk]
}
Table billing."Invoice Lines" {
  id int [pk]
  "user" int [ref: > "user".id]
}
`)
    expect(joinQuery(schema, ['user', 'billing.Invoice Lines'])).toBe(
      'SELECT *\nFROM "user" u\nJOIN billing."Invoice Lines" il ON il."user" = u.id;\n',
    )
  })

  it('keeps aliases unique and away from keywords', () => {
    const schema = model(`
Table order_notes {
  id int [pk]
}
Table other_notes {
  id int [pk]
  note_id int [ref: > order_notes.id]
}
Table oak_nodes {
  id int [pk]
  note_id int [ref: > other_notes.id]
}
`)
    // All three have the initials "on"; "or" is a keyword too.
    expect(joinQuery(schema, ['order_notes', 'other_notes', 'oak_nodes'])).toBe(
      [
        'SELECT *',
        'FROM order_notes ord',
        'JOIN other_notes ot ON ot.note_id = ord.id',
        'JOIN oak_nodes oa ON oa.note_id = ot.id;',
        '',
      ].join('\n'),
    )
  })

  it('joins composite keys on every column', () => {
    const schema = model(`
Table a {
  x int
  y int
  indexes {
    (x, y) [pk]
  }
}
Table b {
  ax int
  ay int
}
Ref: b.(ax, ay) > a.(x, y)
`)
    expect(joinQuery(schema, ['a', 'b'])).toBe(
      'SELECT *\nFROM a a\nJOIN b b ON b.ax = a.x AND b.ay = a.y;\n',
    )
  })

  it('returns null for a path that is too short or leaves the model', () => {
    expect(joinQuery(SHOP, ['orders'])).toBeNull()
    expect(joinQuery(SHOP, ['orders', 'nowhere'])).toBeNull()
    expect(joinQuery(SHOP, ['countries', 'orders'])).toBeNull()
  })
})
