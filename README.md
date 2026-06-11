# update-package-json

A browser-based tool for pasting a `package.json`, resolving dependency updates, and exporting an updated file with clear reviewable changes.

Live app: [update-package-json](https://coleman-zachery.github.io/update-package-json/)

## What it does

- Resolves dependencies against current npm registry metadata
- Prefers npm's `latest` release signal for dependency updates and avoids deprecated publishes when a non-deprecated option exists
- Adds required peer dependencies when needed
- Validates `engines.node` and `engines.npm` against published versions
- Validates npm-style `packageManager` declarations and keeps them aligned with `engines.npm` in the generated output
- Can respect declared engine ranges or override them to latest published runtime versions
- Uses top-level `overrides` to freeze dependencies, with dependency and override versions kept mirrored in the editor
- Detects peer conflicts and downgrades dependencies until the graph is compatible
- Shows changes in separate sections for conflicts, engine notices, version changes, and added dependencies
- Detects the pasted indentation style and lets you flip output formatting between 2-space and 4-space indentation
- Outputs an updated `package.json` you can copy or download

## Stack

- React 19
- TypeScript
- Vite
- CodeMirror 6
- GitHub Pages via GitHub Actions

## Repo layout

- `web/`: the SPA and all application logic
- `.github/workflows/deploy.yml`: GitHub Pages build and deploy workflow
- `Makefile`: local convenience commands

## Local development

Requirements:

- Node.js `>=20`
- npm `>=9`

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
2. Toggle engine handling and optional peer dependency behavior from the top buttons.
3. Optionally freeze dependencies with inline checkboxes; freezing adds matching entries to top-level `overrides`, and engine checkboxes still freeze engine resolution behavior. `packageManager` shares the same npm freeze state as `engines.npm`.
4. Click `Update Package`.
5. Review the `Changes` column and copy or download the generated output.

Notes:

- The output pane writes resolved versions directly.
- Pasted top-level string `overrides` are auto-detected, mirrored back into matching dependency entries, and rendered with their own linked checkboxes.
- When npm metadata is present, the output synchronizes `engines.npm` and `packageManager` to the same resolved npm version, with `packageManager` written immediately before `engines`.
- The `packageManager` line gets its own inline checkbox when it declares npm, and toggling it uses the same freeze state as `engines.npm`.
- Manual edits to frozen dependency entries or their matching `overrides` sync immediately in both directions.
- Manual edits to exact `engines.npm` values or npm-style `packageManager` pins synchronize immediately; frozen npm ranges stay on `engines.npm` while `packageManager` falls back to a compatible pinned recommendation.
- The changes pane suppresses range-prefix-only noise such as `^1.2.3 -> 1.2.3`.
- Engine warnings and engine overrides are surfaced at the top of the changes list.

## GitHub Pages deployment

This repo is configured for GitHub Pages through GitHub Actions, not branch-only static publishing.

- Repository name: `update-package-json`
- Deploy branch: `main`
- Vite base path: `/update-package-json/`

The workflow:

- runs on pushes to `main`
- installs dependencies in `web/` with `npm ci`
- builds the app with `npm run build`
- deploys `web/dist` to GitHub Pages

To make Pages work in GitHub:

1. Set `Settings -> Pages -> Source` to `GitHub Actions`
2. Push to `main`

When Pages is configured correctly, the site URL is:

[update-package-json](https://coleman-zachery.github.io/update-package-json/)

## Check first when changing behavior

- `web/src/App.tsx`: app state and UI interactions
- `web/src/lib/resolver.ts`: dependency resolution and change generation
- `web/src/lib/npm.ts`: npm and runtime version lookups
- `web/src/components/`: presentation and editor behavior
- `web/vite.config.ts`: deployment base path
