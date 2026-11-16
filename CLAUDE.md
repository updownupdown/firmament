# Firmament — notes for agents

Read `docs/ARCHITECTURE.md` first. It is the plan of record.

## Conventions

- TypeScript with **erasable syntax only** (no enums, namespaces or parameter
  properties) so Node can run tests directly. Import local files with the
  `.ts` extension.
- No runtime dependencies. Dev dependencies are esbuild, typescript and
  @types/node only.
- `src/astro` must stay free of DOM and WebGL so it can be tested in Node.
- Angles are radians internally; degrees only at UI boundaries and in data
  files that say so. Times are Julian dates (`jdUT`, `jdTT`) internally.
- Every astronomy function that matters gets a test against a published value.
- UI styles use the CSS custom properties in `src/ui/tokens.css`; don't hard-code
  colours or spacing in components.

## Workflow

- The owner does not run the app locally. Work on a branch, then merge into
  `main` with `--no-ff`; every push to `main` tests and deploys to
  https://updownupdown.github.io/firmament/.
- Before merging: `npm run typecheck && npm test && npm run build`.
- Regenerate data with `npm run data` (needs the source catalogs cloned into
  `../vendor`; see `scripts/build_data.py`).
