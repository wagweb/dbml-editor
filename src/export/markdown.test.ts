import { describe, expect, it } from 'vitest'
import { shownModel } from '@/dbml/derive'
import { parseDbml } from '@/dbml/parse'
import { SAMPLES } from '@/test/schemas'
import { toMarkdown } from './markdown'
import { toMermaid } from './mermaid'

function parse(source: string) {
  const result = parseDbml(source)
  expect(result.diagnostics).toEqual([])
  return result.model!
}

const HEADER =
  '| Column | Type | Key | Null | Default | Note |\n| --- | --- | --- | --- | --- | --- |'

const SHOP = `
Project shop {
  Note: 'Orders and the people who place them.'
}

Table customers {
  id int [pk]
  email varchar(255) [not null, unique, note: 'Login name']
  Note: 'One row per account.'
}

Table orders {
  id int [pk, increment]
  customer_id int [not null, ref: > customers.id]
  status order_status [not null, default: 'new']
  indexes {
    (customer_id, status) [name: 'orders_by_status']
  }
}

Table audit_log {
  id bigint [pk]
  message text
}

Enum order_status {
  new
  shipped [note: 'Left the warehouse']
}

TableGroup sales {
  customers
  orders
  Note: 'Who buys what.'
}
`

const UNGROUPED = `
Table customers { id int [pk] }
Table orders {
  id int [pk]
  customer_id int [ref: > customers.id]
}
`

describe('toMarkdown', () => {
  it('writes the title, diagram, grouped tables and enums', () => {
    const model = parse(SHOP)
    expect(toMarkdown(model, 'Shop')).toBe(`# Shop

Orders and the people who place them.

## Diagram

\`\`\`mermaid
${toMermaid(model)}\`\`\`

## Tables

### sales

Who buys what.

#### customers

One row per account.

${HEADER}
| id | int | PK | no |  |  |
| email | varchar(255) | unique | no |  | Login name |

**Relations**

- \`id\` referenced by \`orders.customer_id\`

#### orders

${HEADER}
| id | int | PK | no |  |  |
| customer_id | int | FK | no |  |  |
| status | order_status |  | no | new |  |

**Indexes**

- \`customer_id\`, \`status\` (name: orders_by_status)

**Relations**

- \`customer_id\` references \`customers.id\`

### Other tables

#### audit_log

${HEADER}
| id | bigint | PK | no |  |  |
| message | text |  | yes |  |  |

## Enums

### order_status

- \`new\`
- \`shipped\`: Left the warehouse
`)
  })

  it('embeds exactly the Mermaid output once', () => {
    const model = parse(SAMPLES.find((s) => s.id === 'storefront')!.source)
    const markdown = toMarkdown(model, 'Storefront')
    expect(markdown).toContain(`\n\`\`\`mermaid\n${toMermaid(model)}\`\`\`\n`)
    expect(markdown.match(/```mermaid/g)).toHaveLength(1)
  })

  it('lists tables directly under the tables heading when there are no groups', () => {
    const markdown = toMarkdown(parse(UNGROUPED), 'Shop')
    expect(markdown).toContain('## Tables\n\n### customers\n')
    // No group headings, and no table heading two levels below "Tables".
    expect(markdown).not.toContain('### Other tables')
    expect(markdown).not.toMatch(/^#### /m)
    expect(markdown).not.toContain('## Enums')
  })

  it('ignores suggested groups, which are not part of the schema', () => {
    const model = parse(SHOP)
    const suggested = { ...model, groups: model.groups.map((g) => ({ ...g, suggested: true })) }
    const markdown = toMarkdown(suggested, 'Shop')
    expect(markdown).not.toContain('### sales')
    expect(markdown).not.toContain('### Other tables')
    expect(markdown).toContain('## Tables\n\n### customers\n')
  })

  it('leaves out the other tables heading when every table has a group', () => {
    const markdown = toMarkdown(parse(SAMPLES.find((s) => s.id === 'storefront')!.source), 'Shop')
    expect(markdown.match(/^### .*$/gm)).toEqual([
      '### Customers',
      '### Catalog',
      '### Sales',
      '### customer_status',
      '### order_status',
    ])
  })

  it('skips the project note when there is none and ends with one newline', () => {
    const markdown = toMarkdown(parse(UNGROUPED), 'Shop')
    expect(markdown.startsWith('# Shop\n\n## Diagram\n')).toBe(true)
    expect(markdown.endsWith('\n')).toBe(true)
    expect(markdown.endsWith('\n\n')).toBe(false)
  })

  it('escapes pipes and line breaks inside table cells', () => {
    const markdown = toMarkdown(
      parse(`
        Table t {
          a varchar [default: 'x|y', note: '''
            first | second
            third
          ''']
        }
      `),
      'Cells',
    )
    expect(markdown).toContain('| a | varchar |  | yes | x\\|y | first \\| second<br>third |')
  })

  it('combines keys and lists every kind of index', () => {
    const markdown = toMarkdown(
      parse(`
        Table users { id int [pk] }
        Table profiles {
          user_id int [pk, unique, ref: - users.id]
          handle varchar [unique]
          indexes {
            (user_id, handle) [pk]
            handle [unique, name: 'handle_idx', type: hash]
            \`lower(handle)\`
          }
        }
      `),
      'Keys',
    )
    expect(markdown).toContain('| user_id | int | PK, FK, unique | no |  |  |')
    expect(markdown).toContain('| handle | varchar | PK, unique | no |  |  |')
    expect(markdown).toContain(
      [
        '**Indexes**',
        '',
        '- `user_id`, `handle` (pk)',
        '- `handle` (unique, name: handle_idx, type: hash)',
        '- `lower(handle)`',
      ].join('\n'),
    )
  })

  it('describes composite, self and schema qualified relations from both sides', () => {
    const markdown = toMarkdown(
      parse(`
        Table a {
          x int
          y int
          indexes { (x, y) [pk] }
        }
        Table sales.b {
          ax int
          ay int
        }
        Table categories {
          id int [pk]
          parent_id int [ref: > categories.id]
        }
        Ref: sales.b.(ax, ay) > a.(x, y)
      `),
      'Relations',
    )
    expect(markdown).toContain('**Relations**\n\n- `(x, y)` referenced by `sales.b.(ax, ay)`\n')
    expect(markdown).toContain('### sales.b\n')
    expect(markdown).toContain('**Relations**\n\n- `(ax, ay)` references `a.(x, y)`\n')
    expect(markdown).toContain(
      '**Relations**\n\n- `parent_id` references `categories.id`\n- `id` referenced by `categories.parent_id`\n',
    )
  })

  it('keeps multi-line enum notes inside their list item', () => {
    const markdown = toMarkdown(
      parse(`
        Enum billing.state {
          open
          closed [note: '''
            Paid in full.
            Kept for ten years.
          ''']
        }
      `),
      'Enums',
    )
    expect(markdown).toBe(
      '# Enums\n\n## Enums\n\n### billing.state\n\n- `open`\n- `closed`: Paid in full.\n  Kept for ten years.\n',
    )
  })

  it('writes only the heading of a table without columns', () => {
    // The parser insists on a column, so the empty table is cut from a parsed one.
    const model = parse(UNGROUPED)
    const withEmptyTable = {
      ...model,
      refs: [],
      tables: model.tables.map((t) => (t.name === 'customers' ? { ...t, columns: [] } : t)),
    }
    expect(toMarkdown(withEmptyTable, 'Shop')).toContain('### customers\n\n### orders\n')
  })

  it('documents the drawn model like the parsed one', () => {
    const model = parse(`
      Table users {
        id int [pk]
        status user_status
      }
      Table posts {
        id int [pk]
        author_id int [ref: > users.id]
      }
      Enum user_status { active }
      Note todo { 'Document this' }
    `)
    const shown = shownModel(model, { view: null, enums: true, suggestGroups: true })
    expect(toMarkdown(shown, 'Blog')).toBe(toMarkdown(model, 'Blog'))
  })
})
