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

## Tokens (`src/index.css`)

| Token                         | Light                           | Dark                            | Use                                                    |
| ----------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `--canvas`                    | `#ffffff`                       | `#000000`                       | Diagram background                                     |
| `--panel`                     | `#fafafa`                       | `#0a0a0a`                       | Header, editor                                         |
| `--surface`                   | `#ffffff`                       | `#0e0e0e`                       | Cards, menus, dialogs                                  |
| `--fill`, `--fill-strong`     | `#f4f4f4`, `#ebebeb`            | `#181818`, `#222222`            | Hover, table headers                                   |
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
- The active row in a menu gets a quiet fill. While the keyboard is in use it also gets
  the accent ring all round (`keyboard:` variant, fed by `src/lib/inputModality.ts`).
  `:focus-visible` is not enough here, because menus move focus on hover.
- Lists you type into (search, code completion) mark the row that Enter will run with a
  return glyph at its end. The glyph always takes its space, so rows never shift.
- A problem tooltip starts with the word "Error" or "Warning" instead of a colour stripe.
- The chosen segment of a switch is framed (`--line-input`, 3:1), not filled with ink.
- A selected table gets a 1.5 px accent ring and a real drop shadow. No coloured glow.
- The relation pulse runs a few times, then fades. A highlighted line ends up solid.
- The overview map only shows while part of the diagram is out of view.

## Typography

- Geist Sans for the interface, 13 px base, sentence case, no all-caps labels.
- Geist Mono for code, column rows, shortcuts and values.
- Table cards use `tracking-normal`, because their width is computed from measured text.

## Custom class names

`canvas-viewport`, `canvas-grid`, `canvas-world`, `table-node`, `table-header`,
`table-body`, `table-lod`, `column-row`, `column-name`, `group-region`, `group-label`,
`edge-layer`, `edge`, `edge-hit`, `edge-line`, `edge-marker`, `edge-flow`.

Check a new name against the Tailwind utility list before adding it.

## Interaction rules

- Scroll pans, pinch or Ctrl/Cmd + scroll zooms. Drawing tools work this way and a
  trackpad never zooms by accident.
- Hover shows, click selects. Hovering a table or relation highlights; clicking a table
  selects it, opens the details panel and reveals its code.
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
