import { writeFileSync } from 'node:fs'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, it } from 'vitest'
import { parseDbml } from '@/dbml/parse'
import { SAMPLES } from '@/test/schemas'
import { LIGHT_PALETTE, renderSvg } from '@/export/svg'
import { runLayout } from './elk'
import {
  approximateMeasure,
  computeTableBox,
  refColumnsByTable,
  type DetailLevel,
  type TableBox,
} from './geometry'

// Dev tool, not a test: renders the samples to SVG for judging layout changes by eye.
// Run with PREVIEW_DIR=/some/dir pnpm vitest run src/layout/preview.test.ts
const out = process.env.PREVIEW_DIR
const elk = new ELK()

const stripGroups = (source: string) => source.replace(/TableGroup[^{]*\{[^}]*\}/g, '')
const extra = SAMPLES.filter((s) => s.id !== 'blog').map((s) => ({
  ...s,
  id: `${s.id}-flat`,
  source: stripGroups(s.source),
}))

const VARIANTS: Record<string, Record<string, string>> = JSON.parse(
  process.env.PREVIEW_VARIANTS ?? '{"default":{}}',
)
const ONLY = process.env.PREVIEW_ONLY?.split(',')
const DETAILS = (process.env.PREVIEW_DETAILS ?? 'full,keys').split(',') as DetailLevel[]

describe.skipIf(!out)('layout preview', () => {
  for (const sample of [...SAMPLES, ...extra].filter((s) => !ONLY || ONLY.includes(s.id))) {
    for (const [variant, overrides] of Object.entries(VARIANTS))
      for (const detail of DETAILS) {
        it(`${sample.id} ${detail} ${variant}`, async () => {
          const model = parseDbml(sample.source).model!
          const refColumns = refColumnsByTable(model)
          const boxes = new Map<string, TableBox>(
            model.tables.map((t) => [
              t.id,
              computeTableBox(t, detail, approximateMeasure, refColumns.get(t.id) ?? new Set()),
            ]),
          )
          const t0 = performance.now()
          const result = await runLayout(
            elk,
            {
              model,
              boxes,
              viewport: {
                width: Number(process.env.PREVIEW_W ?? 1000),
                height: Number(process.env.PREVIEW_H ?? 760),
              },
            },
            overrides,
          )
          const ms = performance.now() - t0
          const { svg, width, height } = renderSvg({
            model,
            boxes,
            ...result,
            palette: LIGHT_PALETTE,
          })
          // Pad to a square so the thumbnailer shows the whole diagram.
          const side = Math.max(width, height)
          const [vx, vy] = svg
            .match(/viewBox="([^"]+)"/)![1]!
            .split(' ')
            .map(Number) as [number, number]
          const square = svg
            .replace(
              /width="\d+" height="\d+" viewBox="[^"]+"/,
              `width="${side}" height="${side}" viewBox="${vx - (side - width) / 2} ${vy - (side - height) / 2} ${side} ${side}"`,
            )
            .replace(
              /<rect x="[^"]+" y="[^"]+" width="\d+" height="\d+" fill="#ffffff"\/>/,
              `<rect x="-99999" y="-99999" width="999999" height="999999" fill="#ffffff"/>`,
            )
          writeFileSync(`${out}/${sample.id}-${detail}-${variant}.svg`, square)
          writeFileSync(
            `${out}/${sample.id}-${detail}-${variant}.txt`,
            `${width}x${height} ${ms.toFixed(0)}ms`,
          )
          console.log(sample.id, detail, `${width}x${height}`, `${ms.toFixed(0)}ms`)
        })
      }
  }
})
