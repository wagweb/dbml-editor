import { create } from 'zustand'
import { useDiagram } from '@/store/diagram'
import { useDocuments } from '@/store/documents'
import { focusTable } from './actions'

/** How far back the trail reaches; older steps fall off. */
const MAX_STEPS = 50

interface Trail {
  back: string[]
  forward: string[]
}

/**
 * The tables chosen one after another, like a browser's history: following relations from
 * table to table, Alt + Left goes back the way you came and Alt + Right forward again.
 */
export const useTrail = create<Trail>(() => ({ back: [], forward: [] }))

let walking = false
let last: string | null = null

useDiagram.subscribe((state, previous) => {
  const next = state.selectedTableId
  if (next === previous.selectedTableId || next === null) return
  if (!walking && last !== null && last !== next) {
    const { back } = useTrail.getState()
    useTrail.setState({ back: [...back, last].slice(-MAX_STEPS), forward: [] })
  }
  last = next
})

// Another diagram starts a new trail.
useDocuments.subscribe((state, previous) => {
  if (state.activeId === previous.activeId) return
  last = null
  useTrail.setState({ back: [], forward: [] })
})

function exists(id: string): boolean {
  return useDiagram.getState().model.tables.some((t) => t.id === id)
}

function step(from: 'back' | 'forward'): boolean {
  const trail = useTrail.getState()
  const steps = [...trail[from]]
  // Tables removed since they were visited are skipped.
  let target: string | undefined
  while (steps.length > 0 && target === undefined) {
    const candidate = steps.pop()!
    if (exists(candidate)) target = candidate
  }
  if (target === undefined) {
    useTrail.setState({ [from]: steps })
    return false
  }
  const other = from === 'back' ? 'forward' : 'back'
  const current = useDiagram.getState().selectedTableId ?? last
  useTrail.setState({
    [from]: steps,
    [other]: current ? [...trail[other], current] : trail[other],
  } as Partial<Trail>)
  walking = true
  try {
    focusTable(target, { focusPanel: false })
  } finally {
    walking = false
  }
  last = target
  return true
}

export const goBack = () => step('back')
export const goForward = () => step('forward')

/** The table "back" leads to, for the button's label; null when there is none. */
export function backTarget(trail: Trail): string | null {
  return [...trail.back].reverse().find(exists) ?? null
}
