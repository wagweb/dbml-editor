import type { GroupModel, SchemaModel, TableModel } from '@/dbml/model'
import { getOwn } from '@/lib/record'
import type { TableBox } from './geometry'
import { bounds, type Point, type Rect } from './router'

/** Space between a group's outline and its tables. Must stay below the layout padding. */
export const GROUP_INSET = { top: 36, side: 14, bottom: 14 } as const

/** Evenly spaced hues at one lightness, so no group shouts louder than another. */
export const GROUP_TONES = [
  '#4c6fff',
  '#d6409f',
  '#12a594',
  '#e5700f',
  '#8e4ec6',
  '#3e9b4f',
  '#e5484d',
  '#0090c8',
] as const

export interface GroupRegion {
  group: GroupModel
  rect: Rect
  tone: string
}

export function groupTone(group: GroupModel, index: number): string {
  return group.color ?? GROUP_TONES[index % GROUP_TONES.length]!
}

/** Colour a table inherits: its own header colour first, then its group's tone. */
export function tableTones(model: SchemaModel): Map<string, string> {
  const tones = new Map<string, string>()
  model.groups.forEach((group, index) => {
    const tone = groupTone(group, index)
    for (const id of group.tableIds) if (!tones.has(id)) tones.set(id, tone)
  })
  for (const table of model.tables) {
    if (table.color) tones.set(table.id, table.color)
  }
  return tones
}

export function tableRect(
  table: Pick<TableModel, 'id'>,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
): Rect | null {
  const box = boxes.get(table.id)
  const position = getOwn(positions, table.id)
  if (!box || !position) return null
  return { x: position.x, y: position.y, width: box.width, height: box.height }
}

export function groupRegions(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
): GroupRegion[] {
  const regions: GroupRegion[] = []
  const groupOf = new Map(model.tables.map((t) => [t.id, t.groupId]))
  model.groups.forEach((group, index) => {
    const members = group.tableIds
      .filter((id) => groupOf.get(id) === group.id)
      .map((id) => tableRect({ id }, boxes, positions))
      .filter((rect): rect is Rect => rect !== null)
    const area = bounds(members)
    if (!area) return
    regions.push({
      group,
      tone: groupTone(group, index),
      rect: {
        x: area.x - GROUP_INSET.side,
        y: area.y - GROUP_INSET.top,
        width: area.width + 2 * GROUP_INSET.side,
        height: area.height + GROUP_INSET.top + GROUP_INSET.bottom,
      },
    })
  })
  return regions
}

/** Bounding box of everything drawn on the canvas. */
export function contentBounds(
  model: SchemaModel,
  boxes: ReadonlyMap<string, TableBox>,
  positions: Readonly<Record<string, Point>>,
): Rect | null {
  const tables = model.tables
    .map((t) => tableRect(t, boxes, positions))
    .filter((rect): rect is Rect => rect !== null)
  const groups = groupRegions(model, boxes, positions).map((region) => region.rect)
  return bounds([...tables, ...groups])
}
