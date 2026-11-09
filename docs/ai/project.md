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

| Feature                                  | Why it lowers mental load                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Automatic layout, left to right          | Referenced tables sit left of the tables that reference them, in every diagram                       |
| Relations attach to the exact column row | No guessing which column a line belongs to                                                           |
| Groups stack when it helps               | The diagram fills the screen instead of becoming one long row                                        |
| Focus mode                               | Selecting a table highlights its relations and greys out the rest                                    |
| Detail levels (all columns, keys, names) | Hide what is not needed for the question at hand                                                     |
| Semantic zoom                            | Zoomed out, tables show their name instead of unreadable rows, further out the group names take over |
| Details panel                            | Notes, defaults, indexes, sample rows and a clickable list of relations                              |
| Path between two tables                  | Shift-click a second table and the shortest chain of relations lights up                             |
| Focus depth                              | Direct neighbours only, or two steps out                                                             |
| Views                                    | A `DiagramView` in the code shows part of the schema, each view with its own arrangement             |
| Suggested groups                         | A schema without groups gets clusters detected from its relations, ready to write into the code      |
| Lines go around tables                   | After moving tables by hand, relations are rerouted instead of running behind other tables           |
| Edit in the diagram                      | Rename tables and columns, drag a relation from column to column; the code follows                   |
| Real files                               | Open and save `.dbml` files, so the schema lives in the repository                                   |
| Schema hints                             | Missing primary keys, unindexed foreign keys, type mismatches, odd names                             |
| Enums and notes on the canvas            | Enum cards linked to the columns that use them, sticky notes as paper                                |
| Last valid diagram stays                 | A typo in the code never blanks the canvas                                                           |
| Start screen                             | Explains the tool in one picture; start new, open a file, import SQL, or just paste or drop          |

## Not built yet

See `open-questions.md` for the list (hosting, multi-file projects, deletions across
tabs).
