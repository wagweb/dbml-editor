/**
 * Choices for an image export. Kept apart from the export itself, which needs the stores,
 * so the UI store can hold the last choices without importing it back.
 */
export interface ImageOptions {
  /** Pixels per diagram unit in a PNG. */
  scale: number
  /** 'auto' follows the app's theme. */
  theme: 'auto' | 'light' | 'dark'
  transparent: boolean
}

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { scale: 3, theme: 'auto', transparent: false }
