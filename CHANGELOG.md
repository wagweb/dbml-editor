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

### Changed

- No more built-in examples. Without a diagram the app shows a start screen: new diagram,
  open a .dbml file, import SQL, or paste or drop DBML or SQL anywhere. Deleting the last
  diagram returns to it. An empty diagram shows a syntax example with "Add this table".
- Automatic layouts after an edit or a detail change keep the arrangement on screen
  instead of starting over; the camera only moves when the diagram no longer fits.
- Large diagrams open at a zoom that shows columns; selecting a table brings it and its
  neighbours into view beside the details panel.
- Below 50% zoom the toolbar offers "Show columns" instead of a detail switch that had no
  effect there. Detail labels are shorter and never wrap.
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

### Fixed

- Table names no longer outgrow their table when zooming far out. Below 24% zoom the
  group names label their regions instead.
- A click on a table no longer moves the camera while most of the table is on screen.
- Buttons that open a menu (view options, export) now stay highlighted while the menu is
  open, like the diagram menu already did.
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
