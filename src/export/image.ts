import geistMonoUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import geistUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { useDiagram } from '@/store/diagram'
import { resolveTheme, useUi } from '@/store/ui'
import { DARK_PALETTE, LIGHT_PALETTE, renderSvg, type SvgExport } from './svg'

import { DEFAULT_IMAGE_OPTIONS, type ImageOptions } from './imageOptions'

export { DEFAULT_IMAGE_OPTIONS, type ImageOptions }

/**
 * Browsers refuse canvases beyond 16384 pixels a side and, in Safari, beyond about 268
 * million pixels in all. Large diagrams are drawn at the highest scale that fits.
 */
const MAX_CANVAS_SIDE = 16_384
const MAX_CANVAS_AREA = 250_000_000

/** The scale a PNG of this size can really get, at most the one asked for. */
export function pngScale(width: number, height: number, wanted: number): number {
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height, 1)
  const byArea = Math.sqrt(MAX_CANVAS_AREA / Math.max(width * height, 1))
  // Two decimals are plenty and keep the reported size honest.
  return Math.floor(Math.min(wanted, bySide, byArea) * 100) / 100
}

let fontCss: Promise<string> | undefined

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read font'))
    reader.readAsDataURL(blob)
  })
}

/** Fonts are inlined so the exported file looks the same on machines without Geist. */
function embeddedFonts(): Promise<string> {
  fontCss ??= Promise.all([toDataUrl(geistUrl), toDataUrl(geistMonoUrl)])
    .then(
      ([sans, mono]) =>
        `@font-face{font-family:'Geist Variable';font-weight:100 900;src:url(${sans}) format('woff2')}` +
        `@font-face{font-family:'Geist Mono Variable';font-weight:100 900;src:url(${mono}) format('woff2')}`,
    )
    .catch(() => '')
  return fontCss
}

export async function diagramSvg(
  options: Pick<ImageOptions, 'theme' | 'transparent'> = DEFAULT_IMAGE_OPTIONS,
): Promise<SvgExport> {
  const { model, boxes, positions, routes } = useDiagram.getState()
  const theme = options.theme === 'auto' ? resolveTheme(useUi.getState().theme) : options.theme
  return renderSvg({
    model,
    boxes,
    positions,
    routes,
    palette: theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE,
    transparent: options.transparent,
    fontCss: await embeddedFonts(),
  })
}

export async function diagramPng(options: ImageOptions = DEFAULT_IMAGE_OPTIONS): Promise<Blob> {
  const { svg, width, height } = await diagramSvg(options)
  const scale = pngScale(width, height, options.scale)
  const pixelWidth = Math.round(width * scale)
  const pixelHeight = Math.round(height * scale)
  // The SVG gets the target size itself. Some browsers rasterise an SVG at its own size
  // first and only then scale the bitmap, which blurs text at 2x and more.
  const sized = svg.replace(
    `width="${width}" height="${height}"`,
    `width="${pixelWidth}" height="${pixelHeight}"`,
  )
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The diagram could not be rendered'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not available')
    // Drawn from the vector source at the target size, so text and lines stay sharp.
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
