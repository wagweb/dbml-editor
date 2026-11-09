import { useMemo, type CSSProperties } from 'react'
import { revealInEditor } from '@/editor/bridge'
import { groupRegions, type GroupRegion } from '@/layout/groups'
import { useDiagram } from '@/store/diagram'
import { useDrag } from './useDrag'

/** Tinted areas behind the tables of each TableGroup. They follow their tables. */
export function GroupLayer() {
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const regions = useMemo(() => groupRegions(model, boxes, positions), [model, boxes, positions])

  return (
    <>
      {regions.map((region) => (
        <Group key={region.group.id} region={region} />
      ))}
    </>
  )
}

function Group({ region }: { region: GroupRegion }) {
  const { group, rect, tone } = region
  const drag = useDrag({
    ids: () => group.tableIds,
    onClick: () => revealInEditor(group.range),
  })

  const style = {
    transform: `translate(${rect.x}px, ${rect.y}px)`,
    width: rect.width,
    height: rect.height,
    '--tone': tone,
  } as CSSProperties

  return (
    <div className="group-region" style={style}>
      <div
        className="group-label absolute top-0 left-0 flex h-9 max-w-full items-center px-3.5 font-semibold tracking-normal"
        // Grows when zoomed out so group names stay readable in the overview.
        style={{ fontSize: 'var(--group-font, 12px)' }}
        data-canvas-interactive
        title={group.note}
        {...drag}
      >
        <span className="truncate">{group.name}</span>
      </div>
    </div>
  )
}
