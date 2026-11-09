export interface FittedLabel {
  /** One or two lines; a long name breaks after an underscore. */
  lines: string[]
  /** Largest font size in px at which every line fits the box. */
  size: number
}

/** Width of a text in em. */
export type MeasureEm = (text: string) => number

/** Estimate for environments without font metrics: 0.6em per character, on the safe side. */
const estimateEm: MeasureEm = (text) => text.length * 0.6
/** Measured widths are exact, so a little air keeps the text off the card's edge. */
const SAFETY = 1.04
const LINE_HEIGHT = 1.15
const PADDING_X = 16
const PADDING_Y = 10
const MAX_SIZE = 72

/**
 * Fits a name into a box for the zoomed-out view. The font may never outgrow the table it
 * labels, otherwise names spill over neighbours once the tables get small on screen.
 */
export function fitLabel(
  name: string,
  width: number,
  height: number,
  measure: MeasureEm = estimateEm,
): FittedLabel {
  const single = [name]
  const split = splitAtUnderscore(name, measure)
  const options = split ? [single, split] : [single]

  let best: FittedLabel = { lines: single, size: 0 }
  for (const lines of options) {
    const widest = Math.max(...lines.map((line) => measure(line) * SAFETY), 0.1)
    const byWidth = Math.max(width - PADDING_X, 1) / widest
    const byHeight = Math.max(height - PADDING_Y, 1) / (lines.length * LINE_HEIGHT)
    const size = Math.min(byWidth, byHeight, MAX_SIZE)
    if (size > best.size) best = { lines, size }
  }
  return { lines: best.lines, size: Math.floor(best.size * 10) / 10 }
}

/** The two-line split with the narrowest widest line, or null if there is no underscore. */
function splitAtUnderscore(name: string, measure: MeasureEm): string[] | null {
  let best: string[] | null = null
  let bestWidth = Infinity
  for (let index = name.indexOf('_'); index !== -1; index = name.indexOf('_', index + 1)) {
    const first = name.slice(0, index + 1)
    const second = name.slice(index + 1)
    if (second.length === 0) continue
    const width = Math.max(measure(first), measure(second))
    if (width < bestWidth) {
      best = [first, second]
      bestWidth = width
    }
  }
  return best
}
