import { useMemo, type CSSProperties } from 'react'
import { revealInEditor } from '@/editor/bridge'
import { groupRegions, type GroupRegion } from '@/layout/groups'
import { fitLabel } from '@/layout/label'
import { measureLabelEm } from '@/layout/measure'
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

/**
 * Far zoomed out, the tables of a group become plain blocks and the group's name is set
 * large across its region, the way a map labels a district instead of every house.
 */
export function GroupOverviewLabels() {
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const regions = useMemo(() => groupRegions(model, boxes, positions), [model, boxes, positions])

  return (
    <>
      {regions.map(({ group, rect, tone }) => {
        const label = fitLabel(group.name, rect.width, rect.height * 0.6, measureLabelEm)
        return (
          <div
            key={group.id}
            aria-hidden
            className="group-overview"
            style={
              {
                transform: `translate(${rect.x}px, ${rect.y}px)`,
                width: rect.width,
                height: rect.height,
                fontSize: `calc(min(var(--lod-need, 13) * 1.3, ${label.size}) * 1px)`,
                '--tone': tone,
              } as CSSProperties
            }
          >
            {label.lines.map((line, index) => (
              <span key={index}>{line}</span>
            ))}
          </div>
        )
      })}
    </>
  )
}

function Group({ region }: { region: GroupRegion }) {
  const { group, rect, tone } = region
  const drag = useDrag({
    ids: () => group.tableIds,
    // A suggested group has no lines in the code to jump to.
    onClick: group.suggested ? undefined : () => revealInEditor(group.range),
  })

  const style = {
    transform: `translate(${rect.x}px, ${rect.y}px)`,
    width: rect.width,
    height: rect.height,
    '--tone': tone,
  } as CSSProperties

  return (
    <div className="group-region" style={style} data-suggested={group.suggested === true}>
      <div
        className="group-label absolute top-0 left-0 flex h-9 max-w-full items-center gap-2 px-3.5 font-semibold tracking-normal"
        // Grows when zoomed out so group names stay readable in the overview.
        style={{ fontSize: 'var(--group-font, 12px)' }}
        data-canvas-interactive
        title={group.suggested ? 'Suggested from the relations, not in the code' : group.note}
        {...drag}
      >
        <span className="truncate">{group.name}</span>
        {group.suggested && (
          <span className="shrink-0 rounded-[4px] px-1.5 py-px text-[0.8em] font-medium shadow-[inset_0_0_0_1px_currentColor]">
            suggested
          </span>
        )}
      </div>
    </div>
  )
}
