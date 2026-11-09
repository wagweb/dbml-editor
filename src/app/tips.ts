import { create } from 'zustand'
import { useUi } from '@/store/ui'

/** Gestures nobody finds by looking: shift-click, double-click, dragging a row's dot. */
export type TipId = 'path' | 'rename' | 'link'

const ORDER: readonly TipId[] = ['path', 'rename', 'link']
export const TIPS_STORAGE_KEY = 'keyline:tips'
const SHOW_AFTER_MS = 700

interface TipsState {
  current: TipId | null
}

export const useTips = create<TipsState>(() => ({ current: null }))

let shownThisSession = false
let timer: ReturnType<typeof setTimeout> | undefined

function readSeen(): Set<TipId> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(TIPS_STORAGE_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? (stored as TipId[]) : [])
  } catch {
    return new Set()
  }
}

function writeSeen(seen: ReadonlySet<TipId>): void {
  try {
    localStorage.setItem(TIPS_STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // Without storage the tip may come back next time; that is all.
  }
}

/**
 * Called when someone clicks a table: the moment the next gesture becomes useful. At most
 * one tip per session, each tip once ever, so they teach without nagging.
 */
export function offerTip(): void {
  const ui = useUi.getState()
  if (shownThisSession || ui.viewer !== null || ui.presenting) return
  const seen = readSeen()
  const next = ORDER.find((id) => !seen.has(id))
  if (!next) return
  shownThisSession = true
  seen.add(next)
  writeSeen(seen)
  timer = setTimeout(() => useTips.setState({ current: next }), SHOW_AFTER_MS)
}

export function dismissTip(): void {
  if (timer) clearTimeout(timer)
  if (useTips.getState().current !== null) useTips.setState({ current: null })
}
