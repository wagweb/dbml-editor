import { approximateMeasure, type MeasureText, type TextRole } from './geometry'

/** Must match the fonts the table cards are rendered with. */
const FONTS: Record<TextRole, string> = {
  title: '600 13px "Geist Variable"',
  name: '500 12px "Geist Mono Variable"',
  type: '400 12px "Geist Mono Variable"',
}

let context: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

function getContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  return context
}

export const measureText: MeasureText = (text, role) => {
  const key = `${role}\u0000${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const ctx = getContext()
  if (!ctx) return approximateMeasure(text, role)
  ctx.font = FONTS[role]
  const width = Math.ceil(ctx.measureText(text).width)
  cache.set(key, width)
  return width
}

/**
 * Table widths are derived from text measurements, so the first layout waits for the
 * fonts. Resolves either way: a missing font only makes cards slightly wider or narrower.
 */
export const fontsReady: Promise<void> =
  typeof document === 'undefined' || !document.fonts
    ? Promise.resolve()
    : Promise.all(Object.values(FONTS).map((font) => document.fonts.load(font, 'Table id')))
        .catch(() => undefined)
        .then(() => {
          cache.clear()
        })
