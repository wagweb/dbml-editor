import type { SchemaModel } from '@/dbml/model'
import { getOwn } from '@/lib/record'
import { computeEdges } from '@/layout/edges'
import type { StoredRoute } from '@/layout/elk'
import { GEOMETRY, NOTE, tableTitle, type TableBox } from '@/layout/geometry'
import { contentBounds, groupRegions, tableTones } from '@/layout/groups'
import type { Point } from '@/layout/router'

export interface SvgPalette {
  canvas: string
  surface: string
  fill: string
  line: string
  lineStrong: string
  ink: string
  ink2: string
  ink3: string
  edge: string
  /** Paper of a sticky note. */
  note: string
}

export const LIGHT_PALETTE: SvgPalette = {
  canvas: '#ffffff',
  surface: '#ffffff',
  fill: '#f4f4f4',
  line: '#e8e8e8',
  lineStrong: '#d4d4d4',
  ink: '#171717',
  ink2: '#525252',
  ink3: '#6b6b6b',
  edge: '#8a8a8a',
  note: '#fbf6e4',
}

export const DARK_PALETTE: SvgPalette = {
  canvas: '#000000',
  surface: '#0e0e0e',
  fill: '#181818',
  line: '#232323',
  lineStrong: '#363636',
  ink: '#ededed',
  ink2: '#a8a8a8',
  ink3: '#8c8c8c',
  edge: '#5c5c5c',
  note: '#1c1910',
}

export interface SvgExportInput {
  model: SchemaModel
  boxes: ReadonlyMap<string, TableBox>
  positions: Readonly<Record<string, Point>>
  routes: Readonly<Record<string, StoredRoute>>
  palette: SvgPalette
  /** Leave the page transparent, e.g. for slides. */
  transparent?: boolean
  /** CSS placed in a style element, used to embed the fonts. */
  fontCss?: string
}

export interface SvgExport {
  svg: string
  width: number
  height: number
}

const MARGIN = 40
const SANS = "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif"
const MONO = "'Geist Mono Variable', 'Geist Mono', ui-monospace, Menlo, monospace"

/** Standalone SVG of the diagram, drawn from the same geometry the canvas uses. */
export function renderSvg(input: SvgExportInput): SvgExport {
  const { model, boxes, positions, routes, palette } = input
  const area = contentBounds(model, boxes, positions) ?? { x: 0, y: 0, width: 320, height: 160 }
  const width = Math.ceil(area.width + 2 * MARGIN)
  const height = Math.ceil(area.height + 2 * MARGIN)
  const tones = tableTones(model)
  const parts: string[] = []

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${area.x - MARGIN} ${area.y - MARGIN} ${width} ${height}" font-family="${SANS}">`,
  )
  if (input.fontCss) parts.push(`<style>${input.fontCss}</style>`)
  if (!input.transparent) {
    parts.push(
      `<rect x="${area.x - MARGIN}" y="${area.y - MARGIN}" width="${width}" height="${height}" fill="${palette.canvas}"/>`,
    )
  }

  for (const region of groupRegions(model, boxes, positions)) {
    const { rect, tone, group } = region
    // Suggested groups are dashed, as on the canvas: they are not in the code.
    const dash = group.suggested ? ' stroke-dasharray="6 5"' : ''
    parts.push(
      `<rect x="${rect.x + 0.5}" y="${rect.y + 0.5}" width="${rect.width - 1}" height="${rect.height - 1}" rx="14" fill="${tone}" fill-opacity="0.05" stroke="${tone}" stroke-opacity="0.28"${dash}/>`,
      `<text x="${rect.x + 14}" y="${rect.y + 23}" font-size="12" font-weight="600" fill="${tone}">${escapeXml(group.name)}</text>`,
    )
  }

  const kindOf = new Map(model.refs.map((ref) => [ref.id, ref.kind]))
  parts.push(
    `<g fill="none" stroke="${palette.edge}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">`,
  )
  for (const edge of computeEdges(model, boxes, positions, routes)) {
    const dash = kindOf.get(edge.refId) === 'enum' ? ' stroke-dasharray="3 4"' : ''
    parts.push(`<path d="${edge.path}"${dash}/>`)
    if (edge.markers) parts.push(`<path d="${edge.markers}"/>`)
  }
  parts.push('</g>')

  model.tables.forEach((table, tableIndex) => {
    const box = boxes.get(table.id)
    const position = getOwn(positions, table.id)
    if (!box || !position) return
    const { x, y } = position
    if (table.kind === 'note') {
      parts.push(noteCard(table.name, box, x, y, palette))
      return
    }
    const isEnum = table.kind === 'enum'
    const tone = tones.get(table.id)
    const headerOnly = box.height === GEOMETRY.headerHeight
    // Index based: two table names can map to the same sanitised id.
    const clipId = `clip-${tableIndex}`

    parts.push(
      `<g>`,
      `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" rx="8"/></clipPath>`,
      `<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" rx="8" fill="${palette.surface}"/>`,
      `<g clip-path="url(#${clipId})">`,
      `<rect x="${x}" y="${y}" width="${box.width}" height="${GEOMETRY.headerHeight}" fill="${palette.fill}"/>`,
    )
    if (tone) {
      parts.push(
        `<rect x="${x}" y="${y}" width="${box.width}" height="${GEOMETRY.headerHeight}" fill="${tone}" fill-opacity="0.14"/>`,
      )
    }
    if (!headerOnly) {
      parts.push(
        `<rect x="${x}" y="${y + GEOMETRY.headerHeight - 1}" width="${box.width}" height="1" fill="${palette.line}"/>`,
      )
    }
    parts.push(
      `</g>`,
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${box.width - 1}" height="${box.height - 1}" rx="7.5" fill="none" stroke="${palette.lineStrong}"/>`,
      `<text x="${x + GEOMETRY.padX}" y="${y + GEOMETRY.headerHeight / 2 + 4.5}" font-size="13" font-weight="600" fill="${palette.ink}">${escapeXml(fit(tableTitle(table), box.width - 2 * GEOMETRY.padX - (isEnum ? 36 : 0), 7.4))}</text>`,
    )
    if (isEnum) {
      parts.push(
        `<text x="${x + box.width - GEOMETRY.padX}" y="${y + GEOMETRY.headerHeight / 2 + 4}" font-size="10.5" font-weight="500" text-anchor="end" fill="${palette.ink2}">enum</text>`,
      )
    }

    box.rows.forEach((column, index) => {
      const rowY = y + GEOMETRY.headerHeight + GEOMETRY.bodyPadY + index * GEOMETRY.rowHeight
      const baseline = rowY + GEOMETRY.rowHeight / 2 + 4
      if (isEnum) {
        parts.push(
          `<text x="${x + GEOMETRY.padX}" y="${baseline}" font-family="${MONO}" font-size="12" fill="${palette.ink}">${escapeXml(column.name)}</text>`,
        )
        return
      }
      const nameX = x + GEOMETRY.padX + GEOMETRY.iconSlot
      if (column.pk)
        parts.push(keyGlyph(x + GEOMETRY.padX, rowY + GEOMETRY.rowHeight / 2, palette.ink))
      else if (column.fk) {
        parts.push(linkGlyph(x + GEOMETRY.padX, rowY + GEOMETRY.rowHeight / 2, palette.ink3))
      }
      parts.push(
        `<text x="${nameX}" y="${baseline}" font-family="${MONO}" font-size="12" font-weight="${column.pk ? 600 : 400}" fill="${palette.ink}">${escapeXml(column.name)}</text>`,
        `<text x="${x + box.width - GEOMETRY.padX}" y="${baseline}" font-family="${MONO}" font-size="12" text-anchor="end" fill="${palette.ink3}">${escapeXml(column.type)}</text>`,
      )
    })

    if (box.hiddenCount > 0) {
      const footerY =
        y + GEOMETRY.headerHeight + GEOMETRY.bodyPadY + box.rows.length * GEOMETRY.rowHeight
      parts.push(
        `<text x="${x + GEOMETRY.padX}" y="${footerY + GEOMETRY.footerHeight / 2 + 4}" font-size="11.5" fill="${palette.ink3}">${hiddenLabel(box.hiddenCount, box.rows.length, isEnum ? 'value' : 'column')}</text>`,
      )
    }
    parts.push('</g>')
  })

  parts.push('</svg>')
  return { svg: parts.join(''), width, height }
}

/** A sticky note: tinted paper, the name as a caption, then the wrapped text. */
function noteCard(name: string, box: TableBox, x: number, y: number, palette: SvgPalette): string {
  const parts = [
    `<g>`,
    `<rect x="${x}" y="${y}" width="${box.width}" height="${box.height}" rx="8" fill="${palette.note}"/>`,
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${box.width - 1}" height="${box.height - 1}" rx="7.5" fill="none" stroke="${palette.lineStrong}"/>`,
    `<text x="${x + GEOMETRY.padX}" y="${y + NOTE.padY + NOTE.captionHeight / 2 + 3.5}" font-size="11" font-weight="500" fill="${palette.ink3}">${escapeXml(fit(name, box.width - 2 * GEOMETRY.padX, 6.3))}</text>`,
  ]
  const top = y + NOTE.padY + NOTE.captionHeight + 4
  ;(box.lines ?? []).forEach((line, index) => {
    parts.push(
      `<text x="${x + GEOMETRY.padX}" y="${top + index * NOTE.lineHeight + NOTE.lineHeight / 2 + 4.5}" font-size="13" fill="${palette.ink2}">${escapeXml(line)}</text>`,
    )
  })
  parts.push('</g>')
  return parts.join('')
}

export function hiddenLabel(hidden: number, shown: number, word = 'column'): string {
  const noun = hidden === 1 ? word : `${word}s`
  return shown === 0 ? `${hidden} ${noun}` : `${hidden} more ${noun}`
}

function keyGlyph(x: number, centerY: number, color: string): string {
  return `<g transform="translate(${x} ${centerY - 6})" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.75" cy="8.25" r="2.5"/><path d="M5.6 6.4L10.5 1.5M8.4 3.6l1.6 1.6"/></g>`
}

function linkGlyph(x: number, centerY: number, color: string): string {
  return `<g transform="translate(${x} ${centerY - 6})" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9L9 3M4.5 3H9v4.5"/></g>`
}

function fit(text: string, maxWidth: number, charWidth: number): string {
  const maxChars = Math.floor(maxWidth / charWidth)
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
