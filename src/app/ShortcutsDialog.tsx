import { Kbd } from '@/ui/Kbd'
import { useUi } from '@/store/ui'
import { Dialog } from '@/ui/Dialog'

const SECTIONS: { title: string; items: [keys: string, description: string][] }[] = [
  {
    title: 'Anywhere',
    items: [
      ['mod+K', 'Search tables, columns and actions'],
      ['mod+\\', 'Show or hide the code'],
      ['mod+O', 'Open a DBML file'],
      ['mod+S', 'Save to the file'],
      ['mod+Z', 'Undo a deleted diagram, a tidy up or an edit made in the diagram'],
    ],
  },
  {
    title: 'Diagram',
    items: [
      ['Scroll', 'Move around'],
      ['mod+Scroll', 'Zoom, or pinch on a trackpad'],
      ['Space+Drag', 'Move around from anywhere'],
      ['+', 'Zoom in'],
      ['-', 'Zoom out'],
      ['0', 'Zoom to 100%'],
      ['1', 'Fit the diagram to the screen'],
      ['shift+A', 'Tidy up the layout'],
      ['Tab', 'Step through the tables'],
      ['Enter', 'Open the details of the focused table'],
      ['F2', 'Rename the focused table'],
      ['shift+Click', 'Show the path from the selected table to the clicked one'],
      ['shift+Arrow', 'Move the focused table'],
      ['Esc', 'Clear the path, then close the details'],
      ['?', 'Show this list'],
    ],
  },
  {
    title: 'Code',
    items: [
      ['mod+F', 'Find and replace'],
      ['ctrl+Space', 'Suggest completions'],
      ['mod+/', 'Comment or uncomment the line'],
      ['F8', 'Jump to the next problem'],
      ['Esc Tab', 'Leave the editor with the keyboard'],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useUi((s) => s.dialog === 'shortcuts')
  const openDialog = useUi((s) => s.openDialog)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => openDialog(next ? 'shortcuts' : null)}
      title="Keyboard shortcuts"
      className="w-[min(520px,calc(100vw-32px))]"
    >
      <div className="min-h-0 overflow-y-auto px-5 pb-5">
        {SECTIONS.map((section) => (
          <section key={section.title} className="pt-2">
            <h3 className="pb-1 text-xs font-medium text-ink-3">{section.title}</h3>
            <dl>
              {section.items.map(([keys, description]) => (
                <div
                  key={keys}
                  className="flex min-h-9 items-center border-b border-line last:border-b-0"
                >
                  <dt className="flex-1 text-[13px] text-ink">{description}</dt>
                  <dd className="flex gap-1">
                    {keys.split(' ').map((key) => (
                      <Kbd key={key} shortcut={key} />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
