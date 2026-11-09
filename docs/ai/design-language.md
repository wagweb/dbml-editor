# Design language

Starting point is the Vercel (Geist) language: neutral greys, hairline borders, small
radii, Geist Sans and Geist Mono, compact 32 px controls. The spin on top of it is the
idea of a drafting sheet.

## What makes it its own

- **Drafting sheet canvas.** Instead of a dot grid, the canvas shows small registration
  crosses. They thin out when zooming out.
- **One accent, used for relations.** Ultramarine marks focus, selection and live
  relations. Everything else is ink on paper. A highlighted relation shows a small pulse
  that runs from the foreign key to the row it references.
- **Cards read like the code.** Column names and types use Geist Mono in the same order as
  in the editor. Types are grey, like in the syntax highlighting.
- **Colour means membership.** Table headers and group regions take the tone of their
  `TableGroup` (or `headercolor`). No other decorative colour.

## App icon

A rounded square tile with two overlapping table frames; the solid overlap stands for the
relation, as in a join diagram. Black and white only: the tile uses `--ink`, the drawing
`--canvas`, so the icon flips with the theme like the primary button. The drawing lives in
`src/app/Logo.tsx` and, as a copy that follows the system colour scheme, in
`public/favicon.svg`. It is drawn on a 32 px grid with a corner radius of 7.5.

## Tokens (`src/index.css`)

| Token                         | Light                           | Dark                            | Use                                                    |
| ----------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `--canvas`                    | `#ffffff`                       | `#000000`                       | Diagram background                                     |
| `--panel`                     | `#fafafa`                       | `#0a0a0a`                       | Header, editor                                         |
| `--surface`                   | `#ffffff`                       | `#0e0e0e`                       | Cards, menus, dialogs                                  |
| `--fill`, `--fill-strong`     | `#f4f4f4`, `#ebebeb`            | `#181818`, `#222222`            | Hover, table headers                                   |
| `--raised`                    | `#ffffff`                       | `#454545`                       | Thumb of a switch, lifted off its `--fill` track       |
| `--line`, `--line-strong`     | `#e8e8e8`, `#d4d4d4`            | `#232323`, `#363636`            | Hairlines, card outline                                |
| `--ink`, `--ink-2`, `--ink-3` | `#171717`, `#525252`, `#6b6b6b` | `#ededed`, `#a8a8a8`, `#8c8c8c` | Text                                                   |
| `--accent`                    | `#2f43f5`                       | `#7d8eff`                       | Focus, selection, active relations                     |
| `--line-input`                | `#8a8a8a`                       | `#6e6e6e`                       | Borders that have to reach 3:1: inputs, chosen segment |
| `--edge`                      | `#8a8a8a`                       | `#5c5c5c`                       | Relations at rest                                      |

Tailwind utilities are generated from these (`bg-surface`, `text-ink-2`, `border-line`).
The SVG export keeps a copy of the palette in `src/export/svg.ts`; change both together.

Rules:

- `--ink-3` is the lightest grey allowed for text. It reaches 4.5:1 on `--fill`.
- The primary button is ink on canvas (black in light, white in dark). The accent is not a
  button colour.
- Radii: 6 px controls, 8 px cards, 12 px panels and menus, 14 px group regions.

## Rows, selection and emphasis

- No one-sided coloured borders on rounded elements. They read as a decoration that got
  cut off. An emphasis either goes all the way round or uses another device.
- Nested corners are concentric: inner radius = outer radius minus the inset. Menus are
  12 px with 4 px padding, so their rows are 8 px; the toolbar is 10 px with 4 px padding
  around 6 px buttons; the palette is 12 px around 6 px rows at 6 px; a toast is 12 px
  around 6 px buttons; the switch is 6 px around a 4 px thumb. Buttons that sit near a
  panel corner keep 6 px from its edge.
- The active row in a menu gets a quiet fill. While the keyboard is in use it also gets
  the accent ring all round (`keyboard:` variant, fed by `src/lib/inputModality.ts`).
  `:focus-visible` is not enough here, because menus move focus on hover.
- Lists you type into (search, code completion) mark the row that Enter will run with a
  return glyph at its end. The glyph always takes its space, so rows never shift.
- A problem tooltip starts with the word "Error" or "Warning" instead of a colour stripe.
- Switches (`src/ui/Segmented.tsx`) are one component everywhere: a `--fill` track and a
  raised thumb (`--raised`, `--shadow-raised`) that slides to the chosen option in 200 ms
  on `--ease-out`. The thumb's ring is `--line-input` (3:1 on the track), so the choice
  does not rest on colour; in dark it is clearly lighter than the track, never a hole.
  Options share the widest label's width, labels keep one weight, and a 2 px gap keeps a
  hover fill clear of the ring. No inner highlight on the thumb: under the ring it reads
  as a second border.
- A selected table gets a 1.5 px accent ring and a real drop shadow. No coloured glow.
- The relation pulse runs a few times, then fades. A highlighted line ends up solid.
- The overview map only shows while part of the diagram is out of view.
- Zoomed out, a label never outgrows the box it names (`src/layout/label.ts`). Below 24%
  zoom the group names take over from the table names.
- A path between two tables uses the same accent as a selection: both ends get the ring,
  the chain stays sharp, everything else goes grey. The details panel lists the steps.
- A column found by search flashes once (`row-flash`, accent soft fill and ring), on the
  card and in the details.

## Details panel

- 352 px wide. The header is the selected card's header, enlarged: the same group tint
  (`.details-header`), and the group's name above the table's in the group's colour, as
  the canvas labels a group region (`.details-context`). Enums and notes say what they are
  in that place. An alias follows the name as DBML writes it, `users as U`. The name is
  never truncated, it wraps; the table note follows as plain text.
- Tabs in the switch's look (`TabList` in `src/ui/Segmented.tsx`): Columns, Relations,
  and Indexes or Data only when there are any. Counts sit in the tab in the tab's text
  colour, quieter by weight. The open tab stays when another table is selected.
- A column is one line: key mark, full name, type. A `?` after the type marks a column
  that may be null; "not null" is the common case and stays unsaid. A note shows as a
  small icon. A click opens the rest (constraints, default, enum values, what it points
  at and what uses it) with Rename, Add relation and Show in code.
- Relations name what the diagram lights: "Highlight" with Direct and 2 steps and the
  number of tables each lights, then References, Referenced by and, at two steps, the
  added tables. Cardinality is read from this table's side (`n:1`, `1:n`). Pointing at a
  relation lights its line.
- Rows are inset, rounded fills like menu rows, with the keyboard ring all round.
- The footer holds what is not about the content: Path to another table, and Move with
  four arrows (the pointer-free alternative to dragging).

## Code editor

- Long lines wrap with a hanging indent: a wrapped line continues one level deeper than
  it started. Wrapping can be turned off in the view menu.
- A hairline per indentation level (`--indent-guide`), drawn as a background of the line.
- The line number gutter is opaque (`--panel`) and the scroller has no sideways rubber
  band, so code never shows through or under the numbers.
- Fold arrows sit between the numbers and the code and appear while the pointer is over
  the margin; a folded block shows a small `…` pill.
- The code cursor marks its column row on the card with a light accent tint and draws
  the relations of that column in the accent. No ring, so it never competes with a
  selection.
- A hint's fix is a small secondary button in the hint tooltip and in the hints list.

## Teaching gestures

- One tip per visit, each tip once, right after a table is clicked: shift-click for paths,
  double-click to rename, the row's dot for relations. A small floating surface above the
  toolbar with a lightbulb in the accent and "Got it"; it leaves with the selection.

## Presentation and view-only links

- Presenting shows the diagram alone. A bar at the bottom in the toolbar's style has
  previous, the stop's name with "2 of 5", next and "Exit" with its key. A note of the
  group or table sits above the bar.
- A view-only diagram shows its name with a "View only" pill in the header, "Present",
  "Export" (secondary) and "Open in editor" (primary). Nothing on the canvas can be
  edited: no rename, no relation handles, no "add to code".

## Start screen

- Shown only when there is no diagram. One picture explains the product: a few lines of
  DBML in the editor's colours, and the two cards they become, built from the canvas
  parts. The relation draws itself once (700 ms), the only motion on the screen; with
  reduced motion it is simply there.
- The three ways in are rows in the style of the search palette (icon tile, title,
  description, keycap). The first one has an ink tile; it is the default path.
- The drafting sheet fades out behind the text (`.start-calm`), so marks never sit under
  words. The paste and drop hint is hidden on touch screens.
- Dropping a file anywhere shows a full-window frame with "Drop to open"; the page behind
  it recedes to 18%.

## Cards that are not tables

- Enum cards look like small tables with a text tag "enum" in the header and values as
  rows without a type. Their link to a column is thin and dashed, with no markers.
- Sticky notes are paper: `--note` (a warm tint, 4.5:1 for `--ink-2` on it), no header
  band, the name as a small caption, the text wrapped by measured width. Notes ignore
  the detail level.
- Suggested groups are dashed (`outline`, not the inset shadow) and carry a "suggested"
  tag next to their name. Writing them to the code turns them solid.
- Chips at the top left of the canvas (view switcher, suggested groups) share the floating
  surface style of the toolbar and only appear when the schema gives a reason.

## Editing on the canvas

- Double-click a name to rename it, F2 on a focused table. The field (`InlineEdit`) takes
  the place of the name, sizes itself to the text, Enter and leaving commit, Escape
  cancels. The details panel offers the same with a pencil button per row.
- A relation handle (small accent ring) sits on the right edge of a column row and shows
  on hover only. Drag it onto another column; the preview line snaps to the row under the
  pointer and turns solid. A click on the handle opens the column picker instead, which is
  also what the details panel offers for keyboard and touch.
- Every edit made in the diagram reports back with a toast that offers Undo.
- Relation handles keep their screen size at every zoom (`--screen-scale`, set by the
  canvas). The selected table shows a small grey point on each row; the hovered row shows
  the full accent dot. The drag preview is drawn above the cards and names its target next
  to the pointer.

## Menus and toolbars

- A button that opens a menu or popover keeps its hover fill while the menu is open.
- A menu or popover lines up with its button on the aligned side: left edge on left edge
  for `start`, right on right for `end`. The ring of `--shadow-pop` lies outside the box,
  so the content is moved inward by it (`RING_ALIGN_OFFSET` in `src/ui/Menu.tsx`).
- The view menu holds diagram options (enum cards, suggested groups, hints, overview map),
  the theme as a submenu that names the current choice, and the shortcuts. The column
  detail lives in the toolbar only.
- Below 50% zoom the toolbar shows "Show columns" instead of the detail switch. Both sit in
  one grid cell and swap by `visibility`, so the toolbar keeps its width; the button takes
  the track's shape.
- Search reads "Search" in the header field and "Search tables, columns and actions"
  everywhere else; the field's accessible name is the full phrase.

## Search field and shortcuts

- The header search is a button that looks like a field: `--fill` with a hairline, a
  placeholder in `--ink-3`, and the shortcut as a keycap on the right. It opens the search
  palette, whose input repeats the same icon and ends in an `Esc` keycap.
- Shortcuts are always rendered by `src/ui/Kbd.tsx`. A keycap is a 10% tint of the text
  colour, so it works on any surface. Menus, search rows and tooltips use the `plain`
  form without a cap.
- A single line of text in a fixed-height control is centred on its letters, not on its
  line box: `[text-box:trim-both_cap_alphabetic]` on the label. Without it the Geist
  metrics leave the text visibly off centre.

## Typography

- Geist Sans for the interface, 13 px base, sentence case, no all-caps labels.
- Geist Mono for code, column rows, shortcuts and values.
- Table cards use `tracking-normal`, because their width is computed from measured text.

## Custom class names

`canvas-viewport`, `canvas-grid`, `canvas-world`, `table-node`, `table-header`,
`table-body`, `table-lod`, `column-row`, `column-name`, `relation-handle`,
`relation-handle-dot`, `inline-edit`, `group-region`, `group-label`, `group-overview`,
`edge-layer`, `edge`, `edge-hit`, `edge-line`, `edge-marker`, `edge-flow`, `edge-preview`,
`edge-preview-end`, `edge-preview-label`, `link-preview-layer`, `start-screen`,
`start-calm`, `start-relation-line`, `start-relation-marker`.

Check a new name against the Tailwind utility list before adding it.

## Interaction rules

- Scroll pans, pinch or Ctrl/Cmd + scroll zooms. Drawing tools work this way and a
  trackpad never zooms by accident.
- Hover shows, click selects. Hover counts once the pointer rests (90 ms), so crossing the
  diagram lights nothing on the way. While a table is selected, hovering other tables
  changes nothing; only a hovered line still shows. Hovering a table or relation highlights; clicking a table
  selects it, opens the details panel and reveals its code. A click leaves the camera
  alone while most of the table is on screen, so a double-click lands where it started.
  Shift-click a second table to ask for the path between the two. A click never zooms;
  only a jump from search or from a hint may zoom in to make columns readable.
- No opacity transitions or animations inside the canvas. Chrome lifts every element
  with a running opacity animation onto its own GPU layer, and everything above it
  follows; a click once doubled the layers and showed a frame without content. Lines
  fade with `stroke-opacity`, handles and levels of detail switch by `visibility`, card
  headers and outlines fade their colours. Overlays above the canvas (panel, menus,
  toasts) may still fade.
- Hints are advice, never alarms: a dotted underline in the text colour in the editor, a
  count in the status bar that opens a list, and a switch to turn them off.
- Nothing disappears on an error. The last valid diagram stays, with a notice.
- Destructive actions are undoable (delete diagram, tidy up) instead of asking first.
- Motion answers an action: tables glide after a layout change, panels fade in. No
  decorative animation. `prefers-reduced-motion` turns transitions off.

## Copy

Plain verbs, sentence case, no dashes as punctuation. Name things the way a user would:
"Tidy up", "Show code", "Go to problem". An action keeps its name everywhere (menu,
palette, toast).

## Accessibility

- Every control is reachable by keyboard and has a visible focus ring in the accent.
- Tables are focusable `article` elements with a descriptive label. Enter opens the
  details and moves focus there, Escape hands it back. Shift + arrow keys move the table.
- Controls come before the tables in the DOM, so the toolbar and the details panel are
  never a hundred tab stops away.
- A state is never shown by colour alone (see decision 19).
- Focus mode greys text instead of fading it, so contrast holds.
- The Playwright suite runs axe in both themes. It has to stay at zero violations.
