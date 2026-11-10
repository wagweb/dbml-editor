# Changelog

## Unreleased

### Added

- Project setup with Vite, React 19, TypeScript, Tailwind CSS 4, oxlint and Prettier.
- Schema model built with the official DBML parser, including table partials and
  relations declared inline.
- Automatic layout: left to right by reference direction, column-level connection points,
  orthogonal routes, groups as regions, wrapping of weakly related groups to fit the
  screen.
- Several diagrams stored in the browser, with examples to start from.
- Manual mode after dragging a table, with "Tidy up" and undo.
- DBML editor based on CodeMirror 6 with syntax highlighting, completion from the official
  DBML language service and inline problem markers.
- Diagram canvas with pan and zoom, table cards, relations with cardinality markers, table
  groups, minimap, details panel and a tooltip for relations.
- Focus mode, three detail levels and a large-name overview when zoomed out.
- Keyboard and single-click alternatives for moving tables, focus handling around the
  details panel, spoken status changes.
- Export as PNG, SVG, SQL (PostgreSQL, MySQL, SQL Server, Oracle) and DBML; import from SQL.
- Share links that carry the whole diagram in the URL.
- Search palette, keyboard shortcuts, light and dark theme, mobile layout.
- Menus, search and completion mark the active row without one-sided accent bars; theme
  choice with a system option; overview map that hides itself when the whole diagram is
  visible.
- Unit tests (Vitest) and end-to-end tests with an accessibility scan (Playwright, axe).
- Project docs in `docs/ai` and a `CLAUDE.md` router.
- Path between two tables: shift-click a second table, or pick it from a list, and the
  shortest chain of relations lights up; the details panel lists the steps. Focus can show
  direct neighbours or two steps.
- Views: `DiagramView` blocks appear as a switcher above the diagram, each view with its
  own arrangement. The status bar shows how many tables are visible.
- Suggested groups for schemas without `TableGroup`, drawn dashed, with a chip to write
  them into the code or stop suggesting.
- Relations go around tables after tables were moved by hand.
- Editing in the diagram: rename a table (double-click, F2 or the details panel), rename a
  column (double-click or the details panel), add a relation by dragging from a column
  handle or by picking the target column. Everything is written into the code and can be
  undone.
- Open and save `.dbml` files (Cmd/Ctrl + O, Cmd/Ctrl + S), with unsaved marker and reload
  when the file changed on disk.
- Column search in the palette; the found column flashes on the card and in the details.
- Schema hints: missing primary keys, foreign keys without an index, type mismatches,
  names that break the prevailing style. Shown in the editor and from the status bar.
- Enums as cards linked to the columns that use them, sticky notes as cards, sample rows
  from `Records` in the details panel. The examples show all three.

- "Copy SQL query" for a path between two tables: one join per relation step.
- Export as Markdown (a data dictionary with a Mermaid diagram) and copy as Mermaid.
- Code formatting with Shift + Alt + F, spaces or tabs and their width in the view menu;
  pasted and opened code keeps its indentation.
- Fixes for schema hints in the code tooltip, the lint panel and the hints list.
- Block templates for Table, Enum, Ref, TableGroup and Note; Tab accepts a suggestion.
- Folding of blocks, indentation guides and wrapped long lines in the editor.
- The code cursor tints its column on the card and lights that column's relations; a
  cursor jump brings an off-screen table into view.
- Presentation mode (P): the diagram alone, group by group.
- View-only links that open without code and are not stored until "Open in editor".
- One-time tips for shift-click, double-click to rename and dragging a relation.

- Several tables at once: Shift + drag selects within a rectangle, Cmd or Ctrl + click
  adds a table, Cmd or Ctrl + A selects all; align, space out, move together, or write
  the selection into the code as a TableGroup or a DiagramView.
- Back and forward through the tables chosen (Alt + Left and Right, and a back button in
  the details).
- A tooltip on a column the pointer rests on: type, constraints, default, reference, note.
- The status bar shows how much of the schema has notes and jumps to the next place
  without one.
- Hint rules: switch hint kinds off, choose the naming style, require columns such as
  `created_at` in every table, with a fix that adds them.
- Layout options in the view menu: left to right or top to bottom, compact, normal or
  airy spacing. Enum cards now sit next to the first table that uses them.
- Image export dialog: PNG at 1x to 4x, colours like the app, light or dark, solid or
  transparent background.

### Changed

- Motion throughout: menus, dialogs, popovers, tooltips, the details panel, bars, tips and
  messages animate out as well as in; relations draw themselves in when a diagram opens
  and after tidying up; column details open smoothly; buttons give when pressed; the
  theme cross-fades; copy buttons show a check.
- Dialogs open with focus on the dialog, not on its close button.

- The details panel has tabs (Columns, Relations, Indexes, Data). Columns are one line
  each and open for their details and actions; relations show how far the highlight
  reaches, with counts and the tables it adds; moving and paths sit in a footer.
- The details header takes the selected card's group tint, with the group name above the
  table name instead of a pill.
- Header controls are spaced evenly by what is visible: 18 px between every edge.
- The editor's fold arrows sit right at the code; problem dots moved left of the line
  numbers and are coloured, round for errors and diamonds for warnings.

- No more built-in examples. Without a diagram the app shows a start screen: new diagram,
  open a .dbml file, import SQL, or paste or drop DBML or SQL anywhere. Deleting the last
  diagram returns to it. An empty diagram shows a syntax example with "Add this table".
- Automatic layouts after an edit or a detail change keep the arrangement on screen
  instead of starting over; the camera only moves when the diagram no longer fits.
- Large diagrams open at a zoom that shows columns; selecting a table brings it and its
  neighbours into view beside the details panel.
- Below 50% zoom the toolbar offers "Show columns" instead of a detail switch that had no
  effect there, in the same space, so the toolbar keeps its width. Detail labels are
  shorter and never wrap.
- Search finds whole words only ("cust" no longer finds "products"), starts with the best
  connected tables, and the relation picker lists keys first.
- Schema hints are grouped by kind, with "Add index" for foreign keys, one or all at once.
- The view menu is shorter: theme moved into a submenu, the column detail stays in the
  toolbar. Auto layout and suggested groups no longer use a sparkle icon.
- Relation handles keep their size on screen at every zoom and show on the selected table;
  the drag preview names its target.
- A "Skip to diagram" link, a visible hint for leaving the editor with the keyboard, and
  keycaps in tooltips that reach 4.5:1.

- Build configuration for AWS Amplify (`amplify.yml`): Node 22 and pnpm 12 are installed
  before the build, the pnpm store is cached, `dist/` is published.

- Header search: label centred on its letters, shortcut shown as a keycap, clearer hover
  state; the palette input got a search icon and an Esc keycap.
- New app icon: two overlapping table frames on a rounded black or white tile that flips
  with the theme.
- Switches (column detail, relation steps, SQL dialect) have a raised thumb that slides to
  the chosen option. Options share one width, so the switch never changes size; in the
  SQL dialogs on a phone the four databases sit in two rows.

### Fixed

- Image exports cut off lines that ran outside the outermost tables, and PNGs could come
  out blurred in some browsers.

- Code that scrolled sideways showed through the line numbers, and the trackpad's rubber
  band moved them.
- Hover fills in menus did not follow the menu's rounded corners.

- Table names no longer outgrow their table when zooming far out. Below 24% zoom the
  group names label their regions instead.
- A click on a table no longer moves the camera while most of the table is on screen.
- Buttons that open a menu (view options, export) now stay highlighted while the menu is
  open, like the diagram menu already did.
- Menus stuck out 1 px past their button, because their outline is drawn outside the box.
  The visible edge now lines up: left with left, right with right.
- A hovered switch option touched the chosen one, and the chosen option showed a doubled
  top edge in dark mode.
- The "+" shortcut showed an empty keycap.
- Relation lines vanished for about half a second after every layout change; they now
  return while the tables settle.
- Opening a share link in a tab that was already open did nothing.
- A frame without content flashed up shortly after clicking a table: opacity animations
  on lines and handles made Chrome create and drop dozens of GPU layers at once. The
  canvas no longer animates opacity; a click keeps the layer count steady.
- The keyboard ring in menus could vanish while the mouse rested on the menu.
- Switching between selected tables flickered: the next table's relations lit up on hover
  before the click, rows re-rendered needlessly and lines snapped while others faded. A
  switch now changes the picture once, and the camera stays put unless the clicked table
  would be covered.
- Clicking a table while zoomed out made the whole canvas flicker: the camera zoomed in and
  every card switched from its name to its rows at once. Clicks no longer zoom, and changes
  between the levels of detail and the greying of a selection now fade.
- Group regions no longer lag behind their tables during a drag (a duplicated style rule
  animated them at all times).
