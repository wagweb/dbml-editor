import { describe, expect, it } from 'vitest'
import { shownModel } from './derive'
import { DEFAULT_HINT_RULES, schemaHints, type HintRules } from './hints'
import { parseDbml } from './parse'

function parse(source: string) {
  const model = parseDbml(source).model
  if (!model) throw new Error('test schema does not parse')
  return model
}

const rules = (changes: Partial<HintRules>): HintRules => ({ ...DEFAULT_HINT_RULES, ...changes })

/** Few styled names, so the majority rule alone has nothing to say. */
const SMALL = `Table orderItems {
  id int [pk]
  unit_price int
  createdAt timestamp
}
Table audit_log {
  message text
}
`

describe('default rules', () => {
  it('give the same hints as no rules at all', () => {
    const model = parse(SMALL)
    expect(schemaHints(model, DEFAULT_HINT_RULES)).toEqual(schemaHints(model))
  })
})

describe('rules.off', () => {
  it('switches off the listed kinds and keeps the others', () => {
    const model = parse(SMALL)
    const all = schemaHints(model, rules({ naming: 'snake' })).map((h) => h.kind)
    expect(all).toContain('no-primary-key')
    expect(all).toContain('naming')

    const some = schemaHints(model, rules({ naming: 'snake', off: ['no-primary-key'] }))
    expect(some.map((h) => h.kind)).not.toContain('no-primary-key')
    expect(some.map((h) => h.kind)).toContain('naming')

    const none = schemaHints(
      model,
      rules({
        naming: 'snake',
        requiredColumns: ['created_at'],
        off: ['no-primary-key', 'naming', 'missing-column'],
      }),
    )
    expect(none).toEqual([])
  })

  it('also covers foreign keys and types', () => {
    const model = parse(`Table a { id bigint [pk] }
      Table b { id int [pk]
        a_id int [ref: > a.id] }`)
    expect(schemaHints(model).map((h) => h.kind)).toEqual([
      'unindexed-foreign-key',
      'type-mismatch',
    ])
    expect(schemaHints(model, rules({ off: ['unindexed-foreign-key', 'type-mismatch'] }))).toEqual(
      [],
    )
  })
})

describe('rules.naming', () => {
  it('flags every name in another style, saying which style the schema uses', () => {
    const model = parse(SMALL)
    // Too few names for a majority to decide.
    expect(schemaHints(model).filter((h) => h.kind === 'naming')).toEqual([])

    const hints = schemaHints(model, rules({ naming: 'snake' })).filter((h) => h.kind === 'naming')
    expect(hints.map((h) => h.message)).toEqual([
      'orderItems is camelCase, this schema uses snake_case',
      'orderItems.createdAt is camelCase, this schema uses snake_case',
    ])
    expect(hints.map((h) => h.suggestion)).toEqual(['order_items', 'created_at'])
    expect(hints[0]!.column).toBeUndefined()
    expect(hints[1]!.column).toBe('createdAt')
  })

  it('can go against the majority', () => {
    const model = parse(SMALL)
    const hints = schemaHints(model, rules({ naming: 'pascal' })).filter((h) => h.kind === 'naming')
    expect(hints.map((h) => h.message)).toEqual([
      'orderItems is camelCase, this schema uses PascalCase',
      'orderItems.unit_price is snake_case, this schema uses PascalCase',
      'orderItems.createdAt is camelCase, this schema uses PascalCase',
      'audit_log is snake_case, this schema uses PascalCase',
    ])
    // Single lowercase words fit every style, so id and message pass.
    expect(hints.some((h) => h.column === 'id' || h.column === 'message')).toBe(false)
    expect(hints.map((h) => h.suggestion)).toContain('UnitPrice')
  })

  it('stays capped', () => {
    const columns = Array.from({ length: 12 }, (_, i) => `  someColumn${i} int`).join('\n')
    const model = parse(`Table things {\n  id int [pk]\n${columns}\n}\n`)
    const hints = schemaHints(model, rules({ naming: 'snake' })).filter((h) => h.kind === 'naming')
    expect(hints).toHaveLength(8)
  })

  it('keeps the majority wording without a chosen style', () => {
    const model = parse(`Table order_items {
      order_id int [pk]
      product_id int
      unit_price int
      createdAt timestamp
    }`)
    expect(schemaHints(model).find((h) => h.kind === 'naming')!.message).toBe(
      'order_items.createdAt is camelCase, most names here are snake_case',
    )
  })
})

describe('rules.requiredColumns', () => {
  const source = `TablePartial stamps {
  created_at timestamp
}
Enum status {
  created_at
  open
}
Table with_stamps {
  id int [pk]
  ~stamps
}
Table plain {
  id int [pk]
  Created_at timestamp
}
Table orders {
  id int [pk]
  created_at timestamp
}
`

  it('points out each missing column once per table', () => {
    const model = parse(source)
    const hints = schemaHints(
      model,
      rules({ requiredColumns: [' created_at ', '', 'created_at', 'updated_at'] }),
    )
    expect(hints.map((h) => h.message)).toEqual([
      'Table with_stamps has no updated_at',
      // Names compare case-sensitively.
      'Table plain has no created_at',
      'Table plain has no updated_at',
      'Table orders has no updated_at',
    ])
    for (const hint of hints) {
      expect(hint.kind).toBe('missing-column')
      expect(hint.column).toBeUndefined()
      const table = model.tables.find((t) => t.id === hint.tableId)!
      expect(hint.range.from).toBe(table.range.from)
      expect(source.slice(hint.range.from, hint.range.to)).toContain(table.name)
    }
    expect(hints.map((h) => h.suggestion)).toEqual([
      'updated_at',
      'created_at',
      'updated_at',
      'updated_at',
    ])
  })

  it('ignores enum cards', () => {
    const shown = shownModel(parse(source), { view: null, enums: true, suggestGroups: false })
    expect(shown.tables.some((t) => t.kind === 'enum')).toBe(true)
    const hints = schemaHints(shown, rules({ requiredColumns: ['deleted_at'] }))
    expect(hints.map((h) => h.tableId)).toEqual(['with_stamps', 'plain', 'orders'])
  })

  it('is quiet with no names or only blank ones', () => {
    const model = parse(source)
    expect(schemaHints(model, rules({ requiredColumns: ['  ', ''] }))).toEqual(schemaHints(model))
  })
})
