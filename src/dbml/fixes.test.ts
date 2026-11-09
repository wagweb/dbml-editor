import { describe, expect, it } from 'vitest'
import { addPrimaryKeyColumn, applyEdits, markPrimaryKey, setColumnType } from './edit'
import { describeFix, fixEdits } from './fixes'
import { inStyle, schemaHints, type Hint } from './hints'
import { parseDbml } from './parse'

function schema(source: string) {
  const model = parseDbml(source).model
  if (!model) throw new Error('test schema does not parse')
  return { source, model }
}

/** Applies the fix for the first hint of a kind and returns the new text. */
function fixed(source: string, kind: Hint['kind']): string | null {
  const { model } = schema(source)
  const hint = schemaHints(model).find((h) => h.kind === kind)
  if (!hint) throw new Error(`no ${kind} hint`)
  const edits = fixEdits(hint, source, model)
  return edits ? applyEdits(source, edits) : null
}

describe('column edits', () => {
  it('changes a type, keeping settings and comments', () => {
    const { source, model } = schema('Table a {\n  ref_id int [not null] // owner\n}\n')
    const edits = setColumnType(source, model, 'a', 'ref_id', 'bigint')!
    expect(applyEdits(source, edits)).toBe('Table a {\n  ref_id bigint [not null] // owner\n}\n')
  })

  it('replaces a type with parentheses and quotes types with spaces', () => {
    const { source, model } = schema('Table a {\n  amount decimal(10, 2)\n}\n')
    const edits = setColumnType(source, model, 'a', 'amount', 'character varying')!
    expect(applyEdits(source, edits)).toBe('Table a {\n  amount "character varying"\n}\n')
  })

  it('adds pk to existing settings or creates them, also after an array type', () => {
    const withSettings = schema('Table a {\n  id int [not null]\n}\n')
    expect(
      applyEdits(
        withSettings.source,
        markPrimaryKey(withSettings.source, withSettings.model, 'a', 'id')!,
      ),
    ).toBe('Table a {\n  id int [pk, not null]\n}\n')
    const array = schema('Table a {\n  id int\n  tags text[]\n}\n')
    expect(applyEdits(array.source, markPrimaryKey(array.source, array.model, 'a', 'id')!)).toBe(
      'Table a {\n  id int [pk]\n  tags text[]\n}\n',
    )
  })

  it('inserts a key column above the first column with its indentation', () => {
    const { source, model } = schema('Table a {\n    name text\n}\n')
    const edits = addPrimaryKeyColumn(source, model, 'a', 'id', 'bigint')!
    expect(applyEdits(source, edits)).toBe('Table a {\n    id bigint [pk]\n    name text\n}\n')
    expect(addPrimaryKeyColumn(source, model, 'a', 'name', 'int')).toBeNull()
  })
})

describe('hint fixes', () => {
  it('indexes a foreign key', () => {
    const source =
      'Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n  a_id int [ref: > a.id]\n}\n'
    expect(fixed(source, 'unindexed-foreign-key')).toContain('indexes {\n    a_id\n  }')
  })

  it('makes an id column the key, or adds one in the type other keys use', () => {
    expect(fixed('Table a {\n  id int\n  name text\n}\n', 'no-primary-key')).toBe(
      'Table a {\n  id int [pk]\n  name text\n}\n',
    )
    const source = 'Table a {\n  id bigint [pk]\n}\nTable b {\n  name text\n}\n'
    expect(fixed(source, 'no-primary-key')).toBe(
      'Table a {\n  id bigint [pk]\n}\nTable b {\n  id bigint [pk]\n  name text\n}\n',
    )
  })

  it('takes over the referenced type', () => {
    const source =
      'Table a {\n  id bigint [pk]\n}\nTable b {\n  id int [pk]\n  a_id int [ref: > a.id]\n}\n'
    expect(fixed(source, 'type-mismatch')).toContain('a_id bigint [ref: > a.id]')
  })

  it('renames a name into the style of the schema', () => {
    const source = [
      'Table order_items {',
      '  order_id int [pk]',
      '  product_id int',
      '  unit_price int',
      '  createdAt timestamp',
      '}',
      '',
    ].join('\n')
    expect(fixed(source, 'naming')).toContain('  created_at timestamp')
  })

  it('describes each fix in a few words', () => {
    const { model } = schema('Table a {\n  name text\n}\n')
    const [hint] = schemaHints(model)
    expect(describeFix(hint!, model)).toEqual({
      label: 'Add id column',
      done: 'Added an id column as primary key',
    })
    expect(describeFix({ ...hint!, kind: 'naming', suggestion: undefined }, model)).toBeNull()
  })
})

describe('inStyle', () => {
  it('converts between the three naming styles', () => {
    expect(inStyle('orderItems', 'snake')).toBe('order_items')
    expect(inStyle('order_items', 'camel')).toBe('orderItems')
    expect(inStyle('order_items', 'pascal')).toBe('OrderItems')
  })
})
