import { describe, expect, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import { approximateMeasure, computeTableBox, type TableBox } from './geometry'
import {
  contentBounds,
  GROUP_INSET,
  GROUP_TONES,
  groupRegions,
  tableRect,
  tableTones,
} from './groups'

const model = parseDbml(`
Table users [headercolor: #123456] { id int }
Table teams { id int }
Table orders { id int }
Table logs { id int }
TableGroup people { users
  teams }
TableGroup sales [color: #ff0000] { orders }
`).model!

const boxes = new Map<string, TableBox>(
  model.tables.map((t) => [t.id, computeTableBox(t, 'full', approximateMeasure, new Set())]),
)
const positions = {
  users: { x: 0, y: 0 },
  teams: { x: 300, y: 40 },
  orders: { x: 0, y: 400 },
  logs: { x: 900, y: 900 },
}

describe('tableTones', () => {
  it('prefers a table colour over the group tone and leaves ungrouped tables plain', () => {
    const tones = tableTones(model)
    expect(tones.get('users')).toBe('#123456')
    expect(tones.get('teams')).toBe(GROUP_TONES[0])
    expect(tones.get('orders')).toBe('#ff0000')
    expect(tones.has('logs')).toBe(false)
  })
})

describe('groupRegions', () => {
  it('wraps the members of a group with room for the label', () => {
    const [people, sales] = groupRegions(model, boxes, positions)
    const users = boxes.get('users')!
    const teams = boxes.get('teams')!
    expect(people!.rect).toEqual({
      x: -GROUP_INSET.side,
      y: -GROUP_INSET.top,
      width: 300 + teams.width + 2 * GROUP_INSET.side,
      height: Math.max(users.height, 40 + teams.height) + GROUP_INSET.top + GROUP_INSET.bottom,
    })
    expect(sales!.tone).toBe('#ff0000')
  })

  it('leaves out groups whose tables are not placed yet', () => {
    expect(groupRegions(model, boxes, { orders: { x: 0, y: 0 } })).toHaveLength(1)
  })
})

describe('contentBounds', () => {
  it('covers tables and group regions', () => {
    const area = contentBounds(model, boxes, positions)!
    const logs = boxes.get('logs')!
    expect(area.x).toBe(-GROUP_INSET.side)
    expect(area.y).toBe(-GROUP_INSET.top)
    expect(area.x + area.width).toBe(900 + logs.width)
    expect(area.y + area.height).toBe(900 + logs.height)
  })

  it('is null for an empty canvas', () => {
    expect(contentBounds(model, boxes, {})).toBeNull()
    expect(tableRect({ id: 'users' }, boxes, {})).toBeNull()
  })
})
