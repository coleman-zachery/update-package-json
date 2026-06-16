# update-package-json

A browser-based tool for pasting a `package.json`, resolving dependency updates, and exporting an updated file with clear reviewable changes.

Live app: [update-package-json](https://coleman-zachery.github.io/update-package-json/)

## What it does

- Resolves dependencies against live npm registry metadata in the browser
- Prefers stable, non-deprecated releases and can intentionally pin below newest stable when compatibility constraints require it
- Validates `engines.node`, `engines.npm`, and npm-style `packageManager` declarations against published versions
- Keeps `engines.npm` and `packageManager` aligned in the generated output when npm metadata is available
- Adds required peer dependencies when needed and highlights unresolved peer requirements when no engine-compatible version can be found
- Supports platform-aware optional native package selection through a `Select Platform` option card
- Uses top-level `overrides` to freeze dependencies, with dependency and override versions mirrored in the editor
- Runs an OSV-backed audit/deprecation pass and can generate `Apply Fixes` recommendations when safer resolutions are available
- Shows reviewable change sections for audit results, recommended fixes, engine warnings/overrides, conflicts, engine updates, version changes, and unresolved peer dependencies
- Includes a dependency explorer for inspecting package version windows and applying selected versions back into the input
- Detects pasted indentation style and lets you flip output formatting between 2-space and 4-space indentation
- Produces an updated `package.json` you can copy or feed back into the input editor

## Stack

- React 19.2
- TypeScript 6.0
- Vite 8.0
- CodeMirror 6
- MUI 9
- GitHub Pages via GitHub Actions

## Repo layout

- `web/`: the SPA and all application logic
- `.github/workflows/deploy.yml`: GitHub Pages build and deploy workflow
- `Makefile`: local convenience commands

## Local development

Requirements:

- Node.js `^22.12.0 || ^24`
- npm `10 - 11`

Install and run:

```bash
make install-web
make dev
```

Other useful commands:

```bash
make build
make preview
make audit
```

If you prefer working directly in `web/`:

```bash
cd web
npm install
npm run dev
```

If `web/package-lock.json` is present, `make install-web` uses `npm ci`; otherwise it falls back to `npm install`.

## How the app behaves

1. Paste a `package.json` into the input editor.
2. Use the top option cards to manage combined engine handling, `Prefer Latest`, platform selection, and optional peer dependency behavior.
3. Optionally freeze dependencies with inline checkboxes; freezing adds matching entries to top-level `overrides`, and engine checkboxes still freeze engine resolution behavior. `packageManager` shares the same npm freeze state as `engines.npm`.
4. Click `Update Package`.
5. Review the `Changes` column and use the output pane actions such as `Copy`, `Use as Input`, `Overrides`, `Major Builds`, and `Transitives`.

Notes:

- The output pane writes resolved versions directly.
- Pasted top-level string `overrides` are auto-detected, mirrored back into matching dependency entries, and rendered with their own linked checkboxes.
- When npm metadata is present, the output synchronizes `engines.npm` and `packageManager` to the same resolved npm version, with `packageManager` written immediately before `engines`.
- The `packageManager` line gets its own inline checkbox when it declares npm, and toggling it uses the same freeze state as `engines.npm`.
- Manual edits to frozen dependency entries or their matching `overrides` sync immediately in both directions.
- Manual edits to exact `engines.npm` values or npm-style `packageManager` pins synchronize immediately; frozen npm ranges stay on `engines.npm` while `packageManager` falls back to a compatible pinned recommendation.
- The changes pane suppresses range-prefix-only noise such as `^1.2.3 -> 1.2.3`.
- Engine warnings and engine overrides are surfaced near the top of the changes list.
- The changes pane can explain compatibility-constrained pins with wording such as `pinned below latest ... via ...`.
- The output pane is read-only; to continue iterating on generated output, use `Use as Input`.

## GitHub Pages deployment

This repo is configured for GitHub Pages through GitHub Actions, not branch-only static publishing.

- Repository name: `update-package-json`
- Deploy branch: `main`
- Vite 8.0 base path: `/update-package-json/`

The workflow:

- runs on pushes to `main`
- uses `web/` as the working directory
- installs dependencies in `web/` with `npm ci`
- builds the app with `npm run build`
- deploys `web/dist` to GitHub Pages

To make Pages work in GitHub:

1. Set `Settings -> Pages -> Source` to `GitHub Actions`
2. Push to `main`

When Pages is configured correctly, the site URL is:

[update-package-json](https://coleman-zachery.github.io/update-package-json/)

## Check first when changing behavior

- `web/src/App/index.tsx`: app state, top-level interactions, and output shaping
- `web/src/components/OptionsBar/`: top option cards, including engines and platform selection
- `web/src/components/Panes/`: input, changes, and output panes
- `web/src/components/DependencyExplorer/`: dependency explorer UI and apply-back flow
- `web/src/lib/npm.ts`: npm and runtime version lookups
- `web/src/lib/resolver/`: dependency resolution, audit pass, engine handling, and platform-aware native optional requests
- `web/src/lib/package-json/`: editor synchronization, overrides mirroring, and package serialization
- `web/src/lib/change-summary/`: `Changes` pane summary generation
- `web/vite.config.ts`: deployment base path
