# Keyline (dbml-editor)

Browser-only DBML editor: code on the left, a database diagram on the right that arranges
itself so relations are easy to follow. No backend, everything is stored in the browser.
"Keyline" is a working title, see `docs/ai/open-questions.md`.

Company-wide defaults (stack, git, texting, doc rules) come from the byteNative wiki that
the global `CLAUDE.md` links to. This file only lists what is specific to this repo.

## Must know

- Run `pnpm check` (type-check, lint, unit tests) before calling a change done. UI changes
  also need `pnpm test:e2e`, which includes the axe accessibility scan.
- Table card metrics live in `src/layout/geometry.ts` only. Layout, canvas and SVG export
  all read them from there, so a card must never be sized through CSS alone.
- Class names must not collide with Tailwind utilities (`table-row` once silently became
  `display: table-row`). Custom classes are listed in `docs/ai/design-language.md`.
- Text greys have to reach 4.5:1 on the darkest surface they appear on. De-emphasis is done
  with grey text, never with opacity on text.
- Decisions are appended to `docs/ai/decisions.md`. Unclear points go to
  `docs/ai/open-questions.md` instead of being guessed.
- UI copy is English, sentence case, no dashes as punctuation.

## Commands

| Command              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm dev`           | Dev server                                                       |
| `pnpm check`         | Type-check, lint and unit tests                                  |
| `pnpm test:coverage` | Unit tests with coverage thresholds (80% lines on logic modules) |
| `pnpm test:e2e`      | Playwright suite (desktop and mobile project, axe scan)          |
| `pnpm build`         | Production build into `dist/`                                    |
| `pnpm format`        | Prettier                                                         |

## Doc map

| Read this                    | When                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `docs/ai/project.md`         | Before any larger task: goal, audience, scope                       |
| `docs/ai/architecture.md`    | Touching stores, the parse to layout pipeline, or module boundaries |
| `docs/ai/layout-engine.md`   | Touching anything under `src/layout/` or the look of relations      |
| `docs/ai/design-language.md` | Any visual or copy change                                           |
| `docs/ai/decisions.md`       | Before reversing or questioning an existing choice                  |
| `docs/ai/open-questions.md`  | Before assuming something that was never decided                    |
