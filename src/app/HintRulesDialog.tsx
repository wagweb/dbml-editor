import { useId, useState } from 'react'
import type { HintKind, NamingStyle } from '@/dbml/hints'
import { useUi } from '@/store/ui'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Segmented } from '@/ui/Segmented'

const KINDS: { kind: HintKind; label: string }[] = [
  { kind: 'no-primary-key', label: 'Tables without a primary key' },
  { kind: 'unindexed-foreign-key', label: 'Foreign keys without an index' },
  { kind: 'type-mismatch', label: 'Relations between different types' },
  { kind: 'naming', label: 'Names that break the naming style' },
  { kind: 'missing-column', label: 'Tables missing a required column' },
]

const STYLES = [
  { value: 'auto', label: 'Most used' },
  { value: 'snake', label: 'snake_case' },
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
] as const

export function HintRulesDialog() {
  const open = useUi((s) => s.dialog === 'hint-rules')
  const openDialog = useUi((s) => s.openDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'hint-rules' : null)}
      title="Schema hint rules"
      description="What the hints look for. They are advice and never block anything."
      className="w-[min(500px,calc(100vw-32px))]"
    >
      {open && <HintRules />}
    </Dialog>
  )
}

function HintRules() {
  const rules = useUi((s) => s.hintRules)
  const set = useUi((s) => s.setHintRules)
  const columnsId = useId()
  const [columns, setColumns] = useState(rules.requiredColumns.join(', '))
  const saveColumns = (text: string) =>
    set({
      requiredColumns: text
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    })

  return (
    <>
      <div className="flex flex-col gap-5 px-5 pb-2">
        <fieldset>
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Show hints about</legend>
          <ul className="-mx-2">
            {KINDS.map(({ kind, label }) => (
              <li key={kind}>
                <label className="flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[13px] text-ink hover:bg-fill">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--accent)"
                    checked={!rules.off.includes(kind)}
                    onChange={(event) =>
                      set({
                        off: event.currentTarget.checked
                          ? rules.off.filter((k) => k !== kind)
                          : [...rules.off, kind],
                      })
                    }
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div>
          <p className="pb-1.5 text-[13px] font-medium text-ink">Naming style</p>
          <Segmented
            label="Naming style"
            className="w-full"
            value={rules.naming ?? 'auto'}
            options={STYLES}
            onChange={(next) => set({ naming: next === 'auto' ? null : (next as NamingStyle) })}
          />
          <p className="mt-1.5 text-xs text-ink-2">
            {rules.naming
              ? 'Every table and column name is checked against this style.'
              : 'Names are checked against the style most names in the schema use.'}
          </p>
        </div>

        <div>
          <label htmlFor={columnsId} className="block pb-1.5 text-[13px] font-medium text-ink">
            Columns every table needs
          </label>
          <input
            id={columnsId}
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="created_at, updated_at"
            value={columns}
            onChange={(event) => setColumns(event.currentTarget.value)}
            onBlur={(event) => saveColumns(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveColumns(event.currentTarget.value)
            }}
            className="h-8 w-full rounded-control bg-surface px-2.5 font-mono text-xs text-ink shadow-[inset_0_0_0_1px_var(--line-input)] outline-none placeholder:text-ink-3 focus:shadow-[inset_0_0_0_1.5px_var(--accent)]"
          />
          <p className="mt-1.5 text-xs text-ink-2">
            Separated by commas. A table without one gets a hint with a fix that adds it.
          </p>
        </div>
      </div>
      <footer className="flex justify-end px-5 py-4">
        <Button
          variant="primary"
          onClick={() => {
            saveColumns(columns)
            useUi.getState().openDialog(null)
          }}
        >
          Done
        </Button>
      </footer>
    </>
  )
}
