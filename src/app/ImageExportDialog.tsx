import { useMemo, type ReactNode } from 'react'
import { pngScale } from '@/export/image'
import { DARK_PALETTE, renderSvg } from '@/export/svg'
import { useDiagram } from '@/store/diagram'
import { useUi } from '@/store/ui'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Segmented } from '@/ui/Segmented'
import { exportImage } from './exportActions'

const FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
] as const
const SCALES = [
  { value: '1', label: '1x' },
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
  { value: '4', label: '4x' },
] as const
const THEMES = [
  { value: 'auto', label: 'Like the app' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const
const BACKGROUNDS = [
  { value: 'solid', label: 'Solid' },
  { value: 'transparent', label: 'Transparent' },
] as const

export function ImageExportDialog() {
  const open = useUi((s) => s.dialog === 'export-image')
  const openDialog = useUi((s) => s.openDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'export-image' : null)}
      title="Export image"
      description="The whole diagram, with every table and relation."
      className="w-[min(460px,calc(100vw-32px))]"
    >
      {open && <ImageExport />}
    </Dialog>
  )
}

function ImageExport() {
  const options = useUi((s) => s.imageExport)
  const set = useUi((s) => s.setImageExport)
  const model = useDiagram((s) => s.model)
  const boxes = useDiagram((s) => s.boxes)
  const positions = useDiagram((s) => s.positions)
  const routes = useDiagram((s) => s.routes)
  // The page size in diagram units, including lines that leave the cards.
  const size = useMemo(() => {
    const { width, height } = renderSvg({ model, boxes, positions, routes, palette: DARK_PALETTE })
    return { width, height }
  }, [model, boxes, positions, routes])
  const scale = pngScale(size.width, size.height, options.scale)
  const png = options.format === 'png'

  const download = () => {
    useUi.getState().openDialog(null)
    void exportImage(options.format)
  }

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-5 pb-2">
        <Row label="Format">
          <Segmented
            label="Format"
            className="w-full"
            value={options.format}
            options={FORMATS}
            onChange={(format) => set({ format })}
          />
        </Row>
        {png && (
          <Row label="Resolution">
            <Segmented
              label="Resolution"
              className="w-full"
              value={String(options.scale) as (typeof SCALES)[number]['value']}
              options={SCALES}
              onChange={(next) => set({ scale: Number(next) })}
            />
          </Row>
        )}
        <Row label="Colours">
          <Segmented
            label="Colours"
            className="w-full"
            value={options.theme}
            options={THEMES}
            onChange={(theme) => set({ theme })}
          />
        </Row>
        <Row label="Background">
          <Segmented
            label="Background"
            className="w-full"
            value={options.transparent ? 'transparent' : 'solid'}
            options={BACKGROUNDS}
            onChange={(next) => set({ transparent: next === 'transparent' })}
          />
        </Row>
      </div>
      <p className="px-5 pt-1 text-xs text-ink-2" aria-live="polite">
        {png
          ? `${Math.round(size.width * scale)} × ${Math.round(size.height * scale)} pixels`
          : 'Sharp at any size, with the fonts embedded.'}
        {png &&
          scale < options.scale &&
          `. Limited to ${scale}x, the largest image a browser draws for a diagram this size.`}
      </p>
      <footer className="flex justify-end gap-2 px-5 py-4">
        <Button variant="ghost" onClick={() => useUi.getState().openDialog(null)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={download}>
          Download {png ? 'PNG' : 'SVG'}
        </Button>
      </footer>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-[13px] text-ink-2">{label}</span>
      {children}
    </>
  )
}
