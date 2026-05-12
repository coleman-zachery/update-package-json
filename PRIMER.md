# PRIMER.md

Read this file at the start of every run. Update it only when the current state, workflow, or active risks change. Keep it short and prune stale notes.

## Repo

- `web/`: React + TypeScript + Vite SPA. This is the whole product.
- `.github/workflows/deploy.yml`: GitHub Pages workflow for the `main` branch.
- `Makefile`: main local entry points are `make dev`, `make build`, and `make preview`; dependency install falls back to `npm install` when `web/package-lock.json` is absent.

## Current Behavior

- Users paste a `package.json` into the web app and click `Update Package`.
- The header branding includes the `{↑}` glyph and the favicon matches that mark.
- The options row uses button toggles, not checkboxes.
- Dedicated `engines.node` and `engines.npm` buttons either add the missing field or toggle respect on and off for an existing field.
- Adding npm support from the top button writes both `engines.npm` and `packageManager` into the input so they start aligned, and a newly injected `packageManager` is placed immediately before `engines`.
- Engine buttons show the latest published Node/npm version in their copy.
- Engine buttons use the orange warning schema when an existing engine is being overridden to latest during update.
- The input and output editors use CodeMirror 6 with visible whitespace markers and a custom empty-state placeholder overlay.
- The input pane header includes a compact 2-space / 4-space toggle; it auto-detects common pasted spacing until the user flips it manually, and the selection drives both editor-side rewrites and the rendered output.
- Inline freeze checkboxes appear for detected engine, npm `packageManager`, dependency, and top-level string `overrides` entries; dependency freezes are materialized in `overrides`, and override/dependency values stay mirrored.
- Input validation runs live for JSON syntax, top-level object shape, and declared engine values.
- Input validation also checks npm-style `packageManager` declarations and warns when `engines.npm` and `packageManager` drift apart.
- Invalid or unpublished engine declarations automatically fall back to the same override-to-latest path used by the engine buttons.
- Pasted top-level string `overrides` are auto-detected, backfilled into dependency sections when needed, and shown as checked freeze markers on both the dependency line and the override line.
- The top options row now includes a right-aligned `Inspect Dependency` control inside the toggle strip; it opens a centered modal with a dimmed overlay, uses the current updated output as its compatibility context, falls back to input when no output exists, shows a borderless horizontally scrollable table grouped by identical engine/direct-dependency signatures, keeps both the header row and `Version` column sticky, lets dependency-column headers jump directly into inspecting that dependency, only reveals the latest three distinct major lines at first, and lets row-level version buttons add either the latest row target or a frozen non-latest override.
- The updated `package.json` output always synchronizes `engines.npm` and `packageManager`, with `packageManager` formatted immediately before `engines`; when npm is frozen to a range, the range is retained on `engines.npm` and `packageManager` is pinned to the best compatible recommendation.
- The `packageManager` checkbox shares the same freeze key as `engines.npm`, so toggling either line affects the same npm constraint.
- Manual valid edits to frozen dependency values, exact `engines.npm` values, or npm-style `packageManager` pins sync in the same editor transaction, while npm ranges preserve a compatible pinned `packageManager` instead of producing `npm@^...`.
- The Updated `package.json` pane writes resolved versions directly.
- The Changes pane suppresses pure range-prefix cleanup noise such as `^1.2.3 -> 1.2.3`, but still shows real version changes.
- In the Changes pane, engine warnings and engine overrides are pinned to the top and do not show count suffixes in their headings.
- Dependency entries that go from `(none)` to a version are shown in separate added blocks for `dependencies`, `devDependencies`, and `peerDependencies`.
- Dependency resolution prefers npm's `dist-tags.latest` release when it is a stable non-deprecated version, and otherwise keeps deprecated publishes behind non-deprecated ones.
- Resolution is freeze-aware: dependency overrides constrain root dependency resolution, and a small engine-settling loop still picks the latest compatible concrete runtime before deciding what engine/packageManager values to write back out.
- Candidate package versions are also screened against the latest install target of their declared `dependencies` and `optionalDependencies`, so engine-incompatible transitive ranges are less likely to slip through as apparently safe upgrades.
- Compact semver display is shared between the dependency explorer and conflict messaging so merged ranges can collapse to concise `~`, `^`, exact, or hyphen forms consistently.
- Missing non-optional peer dependencies inherit the strongest requiring section, with `dependencies` beating `devDependencies`; optional peers always land in `peerDependencies`.
- Copy and Download actions are available on the output pane once resolution completes.

## Deployment

- GitHub Pages is deployed through GitHub Actions, not branch-only static publishing.
- The repo name is `update-package-json`, so `web/vite.config.ts` uses `base: '/update-package-json/'`.
- The workflow builds `web/dist` on pushes to `main`.
- Pages settings must use `Source: GitHub Actions`.
- GitHub Pages should use `GitHub Actions` as its source.

## Check First

- `web/src/App.tsx`: UI state, button behavior, and top-level interactions.
- `web/src/lib/resolver.ts`: dependency and engine resolution rules.
- `web/src/lib/npm.ts`: npm registry and runtime version lookups.
- `web/src/lib/dependency-explorer.ts`: browser-side package version grouping for the dependency explorer popup.
- `web/src/lib/package-json.ts`: parse/serialize helpers and input mutation helpers.
- `web/src/components/`: presentation, editor, and pane rendering.
- `.github/workflows/deploy.yml`: Pages deployment workflow.

## Working Norms

- Prefer browser-only fixes; do not add backend behavior.
- Use `make build` as the quickest smoke test after web changes.
- After meaningful changes, update this file with only the current facts another run needs.

## Prune Rules

- No historical change logs.
- No solved-issue lists unless the issue is still active.
- No long architecture notes that just repeat the codebase.
