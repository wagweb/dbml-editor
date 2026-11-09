import { FileInput, FolderOpen, Plus } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { supportsFileHandles } from '@/lib/files'
import { isEditableTarget } from '@/lib/platform'
import { useUi } from '@/store/ui'
import { CodeSnippet } from '@/ui/CodeSnippet'
import { Kbd } from '@/ui/Kbd'
import { cn } from '@/lib/cn'
import { newDiagram } from './actions'
import { openFile } from './fileActions'
import { openText } from './openText'

const PREVIEW_SOURCE = `Table users {
  id int [pk]
}

Table posts {
  id int [pk]
  author_id int [ref: > users.id]
}`

/**
 * What the app shows before the first diagram exists. It explains the product in one
 * picture, code on the left becoming a diagram on the right, and offers the three ways in.
 */
export function StartScreen() {
  // Pasting DBML or SQL anywhere on this screen starts a diagram from it.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || useUi.getState().dialog) return
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim()) return
      event.preventDefault()
      openText(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const canWriteFiles = supportsFileHandles()

  return (
    <div className="start-screen relative min-h-0 flex-1 overflow-y-auto bg-canvas">
      <div aria-hidden className="canvas-grid" />
      {/* The sheet fades out behind the text, so the marks never sit under the words. */}
      <div aria-hidden className="start-calm" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[600px] flex-col justify-center px-6 py-12">
        <Preview />

        <h1 className="mt-10 text-[22px] leading-tight font-semibold tracking-[-0.01em] text-balance text-ink">
          Start a diagram
        </h1>
        <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-ink-2">
          Write DBML and the tables arrange themselves, with every relation drawn to the column it
          belongs to. Everything stays in this browser until you save a file.
        </p>

        <ul className="-mx-3 mt-6 flex flex-col gap-0.5" aria-label="Ways to start">
          <StartAction
            primary
            icon={<Plus />}
            title="New diagram"
            description="Starts with two related tables to rename or replace"
            onClick={newDiagram}
          />
          <StartAction
            icon={<FolderOpen />}
            title="Open a DBML file"
            description={
              canWriteFiles
                ? 'Saving writes back to the same file, ready to commit'
                : 'Choose a .dbml file on this computer'
            }
            shortcut="mod+O"
            onClick={() => void openFile()}
          />
          <StartAction
            icon={<FileInput />}
            title="Import from SQL"
            description="Turns CREATE TABLE statements into a diagram"
            onClick={() => useUi.getState().openImport()}
          />
        </ul>

        {/* Dropping and pasting need a keyboard and a desktop; on touch screens it is noise. */}
        <p className="mt-6 text-[13px] leading-relaxed text-ink-2 pointer-coarse:hidden">
          You can also drop a .dbml or .sql file on this page, or paste DBML or SQL with{' '}
          <Kbd shortcut="mod+V" className="relative -top-px align-middle" />.
        </p>
      </div>
    </div>
  )
}

interface StartActionProps {
  icon: ReactNode
  title: string
  description: string
  shortcut?: string
  primary?: boolean
  onClick: () => void
}

/** A row in the style of the search palette: the app's own vocabulary for "do this". */
function StartAction({ icon, title, description, shortcut, primary, onClick }: StartActionProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-100 hover:bg-fill active:bg-fill-strong"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]',
            primary
              ? 'bg-ink text-canvas'
              : 'bg-fill text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] group-hover:bg-surface',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="block text-[13px] text-ink-2">{description}</span>
        </span>
        {shortcut && <Kbd shortcut={shortcut} className="max-sm:hidden" />}
      </button>
    </li>
  )
}

/**
 * The product in one picture: the DBML on the left is what the cards on the right are drawn
 * from. Built from the same parts as the canvas, at a smaller size. The relation draws
 * itself once; that is the one moment of motion on this screen.
 */
function Preview() {
  return (
    <div
      aria-hidden
      className="flex items-stretch gap-6 max-sm:flex-col max-sm:items-start max-sm:gap-4"
    >
      <CodeSnippet
        source={PREVIEW_SOURCE}
        className="shrink-0 rounded-[10px] bg-panel px-4 py-3 text-[11.5px] shadow-[inset_0_0_0_1px_var(--line)] max-sm:hidden"
      />
      <div className="relative h-[146px] w-[300px] shrink-0 self-center">
        <MiniTable x={0} y={14} width={116} name="users" rows={[['id', 'int', true]]} />
        <MiniTable
          x={164}
          y={48}
          width={136}
          name="posts"
          rows={[
            ['id', 'int', true],
            ['author_id', 'int', false],
          ]}
        />
        <svg className="start-relation absolute inset-0 overflow-visible" width={300} height={146}>
          <path
            className="start-relation-line"
            pathLength={1}
            d="M116 59.5H134Q140 59.5 140 65.5V111Q140 117 146 117H164"
          />
          <path className="start-relation-marker" d="M123 55V64M153 117L164 112M153 117L164 122" />
        </svg>
      </div>
    </div>
  )
}

interface MiniTableProps {
  x: number
  y: number
  width: number
  name: string
  rows: [name: string, type: string, key: boolean][]
}

function MiniTable({ x, y, width, name, rows }: MiniTableProps) {
  return (
    <div
      className="absolute overflow-hidden rounded-[7px] bg-surface shadow-[0_0_0_1px_var(--line-strong),var(--shadow-card)]"
      style={{ left: x, top: y, width }}
    >
      <div className="flex h-[30px] items-center border-b border-line bg-fill px-2.5 text-[12px] font-semibold text-ink">
        {name}
      </div>
      <ul className="py-[3px]">
        {rows.map(([column, type, key]) => (
          <li
            key={column}
            className="flex h-[24px] items-center px-2.5 font-mono text-[11px] text-ink"
          >
            <span className={cn('min-w-0 flex-1 truncate', key && 'font-semibold')}>{column}</span>
            <span className="text-ink-3">{type}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
