# Keyline

A DBML editor that runs in the browser. Write the schema on the left, read the diagram on
the right. The diagram arranges itself: referenced tables sit to the left of the tables
that reference them, every relation ends at the row of its column, and table groups stay
together.

"Keyline" is a working title.

## Run it

```sh
pnpm install
pnpm dev
```

Node 22 or newer and pnpm are required. For the end-to-end tests, install the browser
once with `pnpm exec playwright install chromium`.

## What it does

- DBML editor with highlighting, completion and inline problems
- Automatic layout that fills the screen, with a manual mode when you drag tables
- Focus on one table: its relations light up, the rest goes grey; shift-click a second
  table to see the path between them
- Views from `DiagramView`, suggested groups for schemas without any, enums and sticky
  notes as cards
- Rename tables and columns and draw relations on the canvas; the DBML follows
- Three levels of detail (all columns, keys, names) and a readable overview when zoomed out
- Several diagrams, saved in the browser, or open and save `.dbml` files; share one as a
  link without a server
- Start by pasting or dropping DBML or SQL anywhere
- Schema hints with one-click fixes: missing primary keys, unindexed foreign keys, type
  mismatches, names that break the pattern
- Copy a SQL query that joins the tables along a path
- Code formatting (Shift + Alt + F) with spaces or tabs; the indentation of pasted and
  opened files is kept; block templates, folding and wrapped long lines in the editor
- The code cursor marks its table, column and relations in the diagram
- Export as PNG, SVG, SQL, DBML, Markdown with a Mermaid diagram, or copy Mermaid for
  GitHub; import from SQL
- View-only links for docs and tickets, and a presentation mode that walks through the
  groups
- Light and dark theme, usable with the keyboard

## Deploy

The build is static. AWS Amplify builds `main` with `amplify.yml`, which installs Node 22
and pnpm 12 before `pnpm build` and publishes `dist/`. Any host that serves static files
works the same way: `pnpm install --frozen-lockfile && pnpm build`, then upload `dist/`.

## Scripts

| Command              | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `pnpm dev`           | Dev server                                       |
| `pnpm check`         | Type-check, lint and unit tests                  |
| `pnpm test:coverage` | Unit tests with coverage                         |
| `pnpm test:e2e`      | Playwright tests including an accessibility scan |
| `pnpm build`         | Production build into `dist/`                    |

## Docs

Project documentation for people and coding agents lives in [`docs/ai`](docs/ai/README.md).
