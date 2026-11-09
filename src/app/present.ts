import { isTable, type SchemaModel } from '@/dbml/model'
import { tableRect } from '@/layout/groups'
import { bounds } from '@/layout/router'
import { fitContent, selectTable, useDiagram } from '@/store/diagram'
import { shownDiagram } from '@/store/documents'
import { useUi } from '@/store/ui'
import { frameRect, type Insets } from '@/store/viewport'

/** One step of a presentation: the whole diagram, a group, or a table with its neighbours. */
export type PresentStop =
  | { kind: 'all'; title: string }
  | { kind: 'group'; title: string; note?: string; tableIds: string[] }
  | { kind: 'table'; title: string; note?: string; tableId: string; tableIds: string[] }

/** A schema without groups is told through its best connected tables, but not all of them. */
const MAX_TABLE_STOPS = 12

/** Room for the presentation bar and its note at the bottom. */
const PRESENT_INSETS: Insets = { top: 48, right: 48, bottom: 140, left: 48 }

/**
 * The stops of a presentation. Groups written in the code come first; without them the
 * suggested ones; without any groups, the tables with the most relations, each shown with
 * the tables it is related to.
 */
export function presentStops(model: SchemaModel, title: string): PresentStop[] {
  const stops: PresentStop[] = [{ kind: 'all', title }]
  const filled = model.groups.filter((group) => group.tableIds.length > 0)
  const written = filled.filter((group) => !group.suggested)
  const groups = written.length > 0 ? written : filled
  if (groups.length > 0) {
    for (const group of groups) {
      stops.push({ kind: 'group', title: group.name, note: group.note, tableIds: group.tableIds })
    }
    return stops
  }

  const neighbours = new Map<string, Set<string>>()
  for (const ref of model.refs) {
    const { child, parent } = ref
    if (ref.kind === 'enum' || child.tableId === parent.tableId) continue
    for (const [a, b] of [
      [child.tableId, parent.tableId],
      [parent.tableId, child.tableId],
    ] as const) {
      const set = neighbours.get(a) ?? new Set<string>()
      set.add(b)
      neighbours.set(a, set)
    }
  }
  const degree = (id: string) => neighbours.get(id)?.size ?? 0
  const hubs = model.tables
    .filter((table) => isTable(table) && degree(table.id) > 0)
    .sort((a, b) => degree(b.id) - degree(a.id))
    .slice(0, MAX_TABLE_STOPS)
  for (const table of hubs) {
    stops.push({
      kind: 'table',
      title: table.name,
      note: table.note,
      tableId: table.id,
      tableIds: [table.id, ...(neighbours.get(table.id) ?? [])],
    })
  }
  return stops
}

export function currentStops(): PresentStop[] {
  return presentStops(useDiagram.getState().model, shownDiagram()?.name ?? 'Diagram')
}

/** Shows a stop: the camera frames its tables, a table stop also lights its relations. */
export function goToStop(index: number): void {
  const stops = currentStops()
  const at = Math.min(Math.max(index, 0), stops.length - 1)
  const stop = stops[at]!
  useUi.getState().setPresentStop(at)
  if (stop.kind === 'all') {
    selectTable(null)
    fitContent(true)
    return
  }
  selectTable(stop.kind === 'table' ? stop.tableId : null)
  const { boxes, positions } = useDiagram.getState()
  const rects = stop.tableIds.flatMap((id) => {
    const rect = tableRect({ id }, boxes, positions)
    return rect ? [rect] : []
  })
  const area = bounds(rects)
  if (area) frameRect(area, { insets: PRESENT_INSETS })
}

let enteredFullscreen = false

export function startPresenting(): void {
  const ui = useUi.getState()
  if (ui.presenting) return
  ui.setCommandOpen(false)
  ui.setPresenting(true)
  enteredFullscreen = false
  document.documentElement
    .requestFullscreen?.()
    .then(() => {
      enteredFullscreen = true
    })
    // Some browsers and embedded frames refuse; the presentation works in the window too.
    .catch(() => undefined)
  // The header and the code disappear first; frame once the canvas has its new size. By
  // then someone may have stepped on already, so it frames the stop that is current.
  requestAnimationFrame(() => requestAnimationFrame(() => goToStop(useUi.getState().presentStop)))
}

export function stopPresenting(): void {
  if (!useUi.getState().presenting) return
  useUi.getState().setPresenting(false)
  selectTable(null)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  enteredFullscreen = false
  requestAnimationFrame(() => requestAnimationFrame(() => fitContent(true)))
}

/** Leaving full screen with the browser's own Escape ends the presentation as well. */
export function onFullscreenChange(): void {
  if (enteredFullscreen && !document.fullscreenElement) stopPresenting()
}
