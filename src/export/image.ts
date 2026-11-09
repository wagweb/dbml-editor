import geistMonoUrl from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import geistUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { useDiagram } from '@/store/diagram'
import { resolveTheme, useUi } from '@/store/ui'
import { DARK_PALETTE, LIGHT_PALETTE, renderSvg, type SvgExport } from './svg'

const PNG_SCALE = 2
/** Browsers refuse canvases beyond roughly this many pixels per side. */
const MAX_CANVAS_SIDE = 12_000

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

export async function diagramSvg(): Promise<SvgExport> {
  const { model, boxes, positions, routes } = useDiagram.getState()
  const palette = resolveTheme(useUi.getState().theme) === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
  return renderSvg({ model, boxes, positions, routes, palette, fontCss: await embeddedFonts() })
}

export async function diagramPng(): Promise<Blob> {
  const { svg, width, height } = await diagramSvg()
  const scale = Math.min(PNG_SCALE, MAX_CANVAS_SIDE / Math.max(width, height))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The diagram could not be rendered'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is not available')
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
