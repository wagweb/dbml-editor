# Project

## Goal

A DBML editor that is nicer to use than dbdiagram.io. The main promise: the diagram
arranges itself in a way that lets you follow relations without effort, so nobody has to
drag tables around before a schema becomes readable.

## Audience

Developers and architects who sketch or document relational schemas. They know SQL, type
fast, and mostly work on a laptop with a trackpad.

## Scope

In scope:

- Write DBML with highlighting, completion and inline problems.
- Live diagram with automatic layout, table groups, focus mode and semantic zoom.
- Several diagrams, stored in the browser. Share by link, without a server.
- Export as PNG, SVG, SQL (PostgreSQL, MySQL, SQL Server, Oracle) and DBML. Import from SQL.
- Light and dark theme, keyboard operation, WCAG 2.2 AA.

Out of scope for now: accounts, collaboration, server-side storage, database connections.

## Features that carry the idea

| Feature                                  | Why it lowers mental load                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Automatic layout, left to right          | Referenced tables sit left of the tables that reference them, in every diagram |
| Relations attach to the exact column row | No guessing which column a line belongs to                                     |
| Groups stack when it helps               | The diagram fills the screen instead of becoming one long row                  |
| Focus mode                               | Selecting a table highlights its relations and greys out the rest              |
| Detail levels (all columns, keys, names) | Hide what is not needed for the question at hand                               |
| Semantic zoom                            | Zoomed out, tables show their name large instead of unreadable rows            |
| Details panel                            | Notes, defaults, indexes and a clickable list of relations                     |
| Last valid diagram stays                 | A typo in the code never blanks the canvas                                     |

## Not built yet

See `open-questions.md` for the list (sticky notes, enum cards, records, hosting).
