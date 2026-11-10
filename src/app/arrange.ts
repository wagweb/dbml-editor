import { tableRect } from '@/layout/groups'
import { snapToGrid } from '@/layout/geometry'
import type { Point, Rect } from '@/layout/router'
import { endDrag, moveTables, useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'

export type Alignment = 'left' | 'top' | 'spread-x' | 'spread-y'

/** Least space left between cards when spreading them out. */
const MIN_GAP = 32

/**
 * Where each card goes. Aligning lines up the left or top edges on the first card's;
 * spreading keeps the outermost cards and shares the room between them equally, in the
 * order the cards already have.
 */
export function aligned(
  cards: { id: string; rect: Rect }[],
  mode: Alignment,
): Record<string, Point> {
  const next: Record<string, Point> = {}
  if (cards.length < 2) return next
  if (mode === 'left' || mode === 'top') {
    const edge = Math.min(...cards.map((c) => (mode === 'left' ? c.rect.x : c.rect.y)))
    for (const { id, rect } of cards) {
      next[id] = mode === 'left' ? { x: edge, y: rect.y } : { x: rect.x, y: edge }
    }
    return next
  }
  const horizontal = mode === 'spread-x'
  const start = (r: Rect) => (horizontal ? r.x : r.y)
  const size = (r: Rect) => (horizontal ? r.width : r.height)
  const sorted = [...cards].sort((a, b) => start(a.rect) - start(b.rect))
  const first = sorted[0]!.rect
  const last = sorted.at(-1)!.rect
  const room = start(last) + size(last) - start(first)
  const filled = sorted.reduce((sum, c) => sum + size(c.rect), 0)
  const gap = Math.max(MIN_GAP, (room - filled) / (sorted.length - 1))
  let at = start(first)
  for (const { id, rect } of sorted) {
    next[id] = horizontal ? { x: snapToGrid(at), y: rect.y } : { x: rect.x, y: snapToGrid(at) }
    at += size(rect) + gap
  }
  return next
}

/** Arranges the selected tables, with an Undo in the message. */
export function alignSelection(mode: Alignment): void {
  const { model, boxes, positions, multiSelection } = useDiagram.getState()
  const cards = model.tables.flatMap((table) => {
    if (!multiSelection.has(table.id)) return []
    const rect = tableRect(table, boxes, positions)
    return rect ? [{ id: table.id, rect }] : []
  })
  const next = aligned(cards, mode)
  if (Object.keys(next).length === 0) return
  const before = Object.fromEntries(cards.map(({ id, rect }) => [id, { x: rect.x, y: rect.y }]))
  moveTables(next)
  endDrag()
  useUi.getState().showToast({
    text: mode === 'left' || mode === 'top' ? 'Tables aligned' : 'Tables spaced out',
    action: {
      label: 'Undo',
      run: () => {
        moveTables(before)
        endDrag()
      },
    },
  })
}
