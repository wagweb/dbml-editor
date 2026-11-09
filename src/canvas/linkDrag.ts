import { create } from 'zustand'
import type { ColumnRef } from '@/app/editActions'
import type { Point } from '@/layout/router'

interface LinkDragState {
  /** Column a new relation is being dragged from, or null when nothing is dragged. */
  from: ColumnRef | null
  /** Pointer in world coordinates. */
  pointer: Point | null
  /** Column under the pointer that could take the other end. */
  target: ColumnRef | null
}

/** A relation being drawn from one column to another. Lives outside React for speed. */
export const useLinkDrag = create<LinkDragState>()(() => ({
  from: null,
  pointer: null,
  target: null,
}))

export function startLinkDrag(from: ColumnRef, pointer: Point): void {
  useLinkDrag.setState({ from, pointer, target: null })
}

export function moveLinkDrag(pointer: Point, target: ColumnRef | null): void {
  const state = useLinkDrag.getState()
  const sameTarget =
    state.target === target ||
    (state.target !== null &&
      target !== null &&
      state.target.tableId === target.tableId &&
      state.target.column === target.column)
  useLinkDrag.setState(sameTarget ? { pointer } : { pointer, target })
}

export function endLinkDrag(): void {
  useLinkDrag.setState({ from: null, pointer: null, target: null })
}

/** The column row under a screen point, if any. */
export function columnAt(clientX: number, clientY: number): ColumnRef | null {
  const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-column]')
  const card = row?.closest<HTMLElement>('[data-table-id]')
  const column = row?.dataset.column
  const tableId = card?.dataset.tableId
  // Only real tables can take part in a relation; enum values are listed as rows too.
  if (!row || !card || !column || !tableId || card.dataset.kind !== 'table') return null
  return { tableId, column }
}
