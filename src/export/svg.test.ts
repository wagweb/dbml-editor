import { describe, expect, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import {
  approximateMeasure,
  computeTableBox,
  refColumnsByTable,
  type TableBox,
} from '@/layout/geometry'
import { DARK_PALETTE, hiddenLabel, LIGHT_PALETTE, renderSvg } from './svg'

function setup(detail: 'full' | 'keys' | 'names' = 'full') {
  const model = parseDbml(`
    Table users { id int [pk]
      "full <name>" varchar
      team_id int [ref: > teams.id] }
    Table teams { id int [pk]
      title varchar }
    TableGroup "R&D" { users
      teams }
  `).model!
  const refColumns = refColumnsByTable(model)
  const boxes = new Map<string, TableBox>(
    model.tables.map((t) => [
      t.id,
      computeTableBox(t, detail, approximateMeasure, refColumns.get(t.id) ?? new Set()),
    ]),
  )
  const positions = { users: { x: 300, y: 40 }, teams: { x: 0, y: 0 } }
  return { model, boxes, positions, routes: {} }
}

describe('renderSvg', () => {
  it('draws every table, column, relation and group', () => {
    const { svg } = renderSvg({ ...setup(), palette: LIGHT_PALETTE })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    for (const text of ['>users<', '>teams<', '>team_id<', '>varchar<', '>title<']) {
      expect(svg).toContain(text)
    }
    // One relation: its line and its markers, drawn in the edge colour.
    const edges = new RegExp(`<g fill="none" stroke="${LIGHT_PALETTE.edge}"[^>]*>(.*?)</g>`).exec(
      svg,
    )
    expect(edges?.[1]?.match(/<path /g)).toHaveLength(2)
  })

  it('escapes names so the file stays valid XML', () => {
    const { svg } = renderSvg({ ...setup(), palette: LIGHT_PALETTE })
    expect(svg).toContain('full &lt;name&gt;')
    expect(svg).toContain('R&amp;D')
    expect(svg).not.toContain('<name>')
  })

  it('sizes the canvas to the content plus a margin', () => {
    const input = setup()
    const { width, height, svg } = renderSvg({ ...input, palette: LIGHT_PALETTE })
    const users = input.boxes.get('users')!
    expect(width).toBeGreaterThan(300 + users.width)
    expect(height).toBeGreaterThan(40 + users.height)
    expect(svg).toContain(`width="${width}" height="${height}"`)
  })

  it('uses the palette of the chosen theme and can leave the page transparent', () => {
    const dark = renderSvg({ ...setup(), palette: DARK_PALETTE })
    expect(dark.svg).toContain(`fill="${DARK_PALETTE.canvas}"`)
    const clear = renderSvg({ ...setup(), palette: DARK_PALETTE, transparent: true })
    expect(clear.svg).not.toContain(`height="${clear.height}" fill="${DARK_PALETTE.canvas}"`)
  })

  it('embeds the font styles it is given', () => {
    const { svg } = renderSvg({ ...setup(), palette: LIGHT_PALETTE, fontCss: '@font-face{}' })
    expect(svg).toContain('<style>@font-face{}</style>')
  })

  it('mentions hidden columns at reduced detail', () => {
    const { svg } = renderSvg({ ...setup('keys'), palette: LIGHT_PALETTE })
    expect(svg).toContain('1 more column')
    expect(svg).not.toContain('>title<')
  })

  it('renders an empty diagram without failing', () => {
    const empty = { model: parseDbml('').model!, boxes: new Map(), positions: {}, routes: {} }
    expect(renderSvg({ ...empty, palette: LIGHT_PALETTE }).svg).toContain('</svg>')
  })
})

describe('hiddenLabel', () => {
  it('reads naturally for one or many columns', () => {
    expect(hiddenLabel(1, 2)).toBe('1 more column')
    expect(hiddenLabel(3, 2)).toBe('3 more columns')
    expect(hiddenLabel(4, 0)).toBe('4 columns')
  })
})
