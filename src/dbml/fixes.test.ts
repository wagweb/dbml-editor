import { describe, expect, it } from 'vitest'
import { addPrimaryKeyColumn, applyEdits, markPrimaryKey, setColumnType } from './edit'
import { describeFix, fixEdits, guessColumnType } from './fixes'
import { DEFAULT_HINT_RULES, inStyle, schemaHints, type Hint, type HintRules } from './hints'
import { parseDbml } from './parse'

function schema(source: string) {
  const model = parseDbml(source).model
  if (!model) throw new Error('test schema does not parse')
  return { source, model }
}

/** Applies the fix for the first hint of a kind and returns the new text. */
function fixed(
  source: string,
  kind: Hint['kind'],
  rules: HintRules = DEFAULT_HINT_RULES,
): string | null {
  const { model } = schema(source)
  const hint = schemaHints(model, rules).find((h) => h.kind === kind)
  if (!hint) throw new Error(`no ${kind} hint`)
  const edits = fixEdits(hint, source, model)
  return edits ? applyEdits(source, edits) : null
}

const requiring = (...requiredColumns: string[]): HintRules => ({
  ...DEFAULT_HINT_RULES,
  requiredColumns,
})

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

describe('missing column fix', () => {
  it('adds the column with a type that fits its name', () => {
    const source = 'Table a {\n  id uuid [pk]\n  name text\n  indexes {\n    name\n  }\n}\n'
    expect(fixed(source, 'missing-column', requiring('created_at'))).toBe(
      'Table a {\n  id uuid [pk]\n  name text\n  created_at timestamp\n  indexes {\n    name\n  }\n}\n',
    )
    expect(fixed(source, 'missing-column', requiring('owner_id'))).toContain(
      '  name text\n  owner_id uuid\n',
    )
  })

  it('leaves no hint behind', () => {
    const rules = requiring('created_at', 'is_active')
    let source = 'Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}\n'
    for (let round = 0; round < 4; round += 1) source = fixed(source, 'missing-column', rules)!
    expect(schemaHints(schema(source).model, rules)).toEqual([])
    expect(source).toContain('  is_active boolean\n')
  })

  it('is described with the column name', () => {
    const { model } = schema('Table a {\n  id int [pk]\n}\n')
    const [hint] = schemaHints(model, requiring('created_at'))
    expect(describeFix(hint!, model)).toEqual({ label: 'Add created_at', done: 'Added created_at' })
    expect(describeFix({ ...hint!, suggestion: undefined }, model)).toBeNull()
    expect(
      fixEdits({ ...hint!, suggestion: undefined }, 'Table a {\n  id int [pk]\n}\n', model),
    ).toBeNull()
    expect(describeFix({ ...hint!, tableId: 'missing' }, model)).toBeNull()
  })

  it('is not offered for a table whose columns all come from partials', () => {
    const source = 'TablePartial base {\n  id int [pk]\n}\nTable a {\n  ~base\n}\n'
    const { model } = schema(source)
    const [hint] = schemaHints(model, requiring('created_at'))
    expect(hint!.kind).toBe('missing-column')
    expect(describeFix(hint!, model)).toBeNull()
    expect(fixEdits(hint!, source, model)).toBeNull()
  })
})

describe('guessColumnType', () => {
  const table = (source: string) => schema(source).model.tables[0]!

  it('reads timestamps and flags from the name', () => {
    const plain = table('Table a {\n  name text\n}\n')
    expect(guessColumnType('created_at', plain)).toBe('timestamp')
    expect(guessColumnType('updatedAt', plain)).toBe('timestamp')
    expect(guessColumnType('is_active', plain)).toBe('boolean')
    expect(guessColumnType('hasChildren', plain)).toBe('boolean')
    expect(guessColumnType('has_owner', plain)).toBe('boolean')
    // A word that merely starts with "is" or "has" is not a flag.
    expect(guessColumnType('island', plain)).toBe('varchar')
    expect(guessColumnType('hash', plain)).toBe('varchar')
    expect(guessColumnType('name', plain)).toBe('varchar')
  })

  it('gives keys the type of the table key, or int', () => {
    const uuidKey = table('Table a {\n  id uuid [pk]\n}\n')
    expect(guessColumnType('owner_id', uuidKey)).toBe('uuid')
    expect(guessColumnType('ownerId', uuidKey)).toBe('uuid')
    const composite = table(
      'Table a {\n  x bigint\n  y bigint\n  indexes {\n    (x, y) [pk]\n  }\n}\n',
    )
    expect(guessColumnType('owner_id', composite)).toBe('int')
    expect(guessColumnType('owner_id', table('Table a {\n  name text\n}\n'))).toBe('int')
  })
})

describe('inStyle', () => {
  it('converts between the three naming styles', () => {
    expect(inStyle('orderItems', 'snake')).toBe('order_items')
    expect(inStyle('order_items', 'camel')).toBe('orderItems')
    expect(inStyle('order_items', 'pascal')).toBe('OrderItems')
  })
})
