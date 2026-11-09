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
