import { create } from 'zustand'

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** The selection rectangle being dragged out, in canvas pixels; null when there is none. */
export const useMarquee = create<{ rect: ScreenRect | null }>(() => ({ rect: null }))
