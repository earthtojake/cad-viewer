# CAD Explorer Viewer

This package contains the CAD Explorer viewer: a Vite/React app for inspecting CAD and robot-description files, plus a package-local snapshot CLI. This README is only for developing and iterating on this viewer package.

The viewer is read-only with respect to the active scan root. It discovers existing files and colocated viewer assets; it does not generate CAD, run Python, or start robot middleware.

## Quick Start

Run these commands from this directory:

```bash
npm install
npm run dev
npm run test
npm run build
```

For a root-aware dev server that prints a reusable URL:

```bash
npm run dev:ensure -- \
  --workspace-root /path/to/workspace \
  --root-dir models \
  --file fun/robotic_hand_end_effector.step
```

Use the URL printed by `dev:ensure`; do not assume a fixed port during development.

## Package Map

- `main.jsx`: React entrypoint.
- `components/CadWorkspace.js`: workspace shell, file selection, side panels, and shared viewer state.
- `components/CadExplorer.js`: 3D CAD, mesh, URDF, SRDF, and SDF scene runtime.
- `components/DxfExplorer.js`: 2D DXF flat-pattern runtime.
- `components/workbench/`: workbench controls, file sheets, toolbar, and theme settings UI.
- `common/`: shared non-React scene, theme, STEP module, topology, and snapshot helpers.
- `lib/`: file scanning, format parsers, selector runtime, persistence, and viewer utilities.
- `scripts/ensure-dev.mjs`: reusable dev-server launcher.
- `snapshot/index.mjs`: headless snapshot CLI.

## Data Inputs

The viewer scans `EXPLORER_ROOT_DIR` under `EXPLORER_WORKSPACE_ROOT`. If `EXPLORER_WORKSPACE_ROOT` is unset, it is inferred from the process working directory. If `EXPLORER_ROOT_DIR` is unset, the workspace root is scanned.

Supported visible entries:

- `.step` and `.stp`
- `.stl`
- `.3mf`
- `.glb`
- `.dxf`
- `.urdf`
- `.srdf`
- `.sdf`

STEP entries use colocated hidden GLB sidecars named `.<step-filename>.glb`. For example, `models/part.step` pairs with `models/.part.step.glb`. The GLB may contain the `STEP_topology` extension used for assembly structure, face picking, edge picking, and copied `@cad[...]` references.

URDF, SRDF, and SDF entries are parsed directly from XML. Referenced mesh files are resolved relative to the selected robot-description file when possible. SRDF entries use `<explorer:urdf path="..."/>` metadata to locate the linked URDF.

## Runtime

`npm run dev` starts Vite on `EXPLORER_PORT` with `strictPort`. If that port is occupied, Vite reports the conflict.

`npm run dev:ensure` probes existing local viewer servers with `GET /__cad/server`, reuses a matching scan root when possible, and otherwise starts a detached Vite server on the first available port from `EXPLORER_PORT` through `EXPLORER_PORT_END`.

Important environment variables:

- `EXPLORER_WORKSPACE_ROOT`: base workspace path.
- `EXPLORER_ROOT_DIR`: scan root relative to the workspace root, or an absolute scan root inside it.
- `EXPLORER_DEFAULT_FILE`: scan-root-relative file opened when `?file=` is absent.
- `EXPLORER_PORT`: preferred dev/preview port, default `4178`.
- `EXPLORER_PORT_END`: optional end of the `dev:ensure` port search range.
- `EXPLORER_GITHUB_URL`: top-bar GitHub link target.
- `EXPLORER_ALLOWED_HOSTS`: extra hostnames accepted by local Vite dev and preview.
- `EXPLORER_MOVEIT2_WS_URL`: optional websocket URL for SRDF MoveIt2 controls in local dev.
- `EXPLORER_SERVER_REGISTRY`: optional path for the local server registry JSON file.

Production builds scan at build time. Set `EXPLORER_WORKSPACE_ROOT`, `EXPLORER_ROOT_DIR`, and `EXPLORER_DEFAULT_FILE` before `npm run build` when the static app should include a specific catalog/default file.

## Persistence

URL query params own shareable selection state:

- `?file=` selects the active entry.
- `?refs=` carries copied CAD references into the workspace.
- `?moveit2Ws=` overrides `EXPLORER_MOVEIT2_WS_URL` for one local browser session.

Browser storage is intentionally narrow. Theme selection and custom themes are stored by `lib/workbench/persistence.js`. The storage key is `cad-explorer:theme` because it belongs to CAD Explorer viewer UI state.

Workspace state such as panels, directory expansion, drawing state, active tools, and per-file view state is React/session state, not durable browser storage.

## Snapshot CLI

The package-local snapshot CLI creates still images, STEP-module parameter GIFs, SVG sections, and part lists from the same shared scene helpers used by the UI. Use GIFs only for CAD parameter animation review; use still snapshots otherwise.

```bash
npm run snapshot -- --job path/to/job.json
npm run snapshot -- --job -
npm run snapshot -- --input models/part.step --output /tmp/part.png --theme technical
```

Shortcut flags are for common theme snapshots:

- `--input`
- `--output`
- `--mode`
- `--theme`
- `--camera`
- `--width`
- `--height`
- `--size-profile`
- `--view-labels`
- `--params`

Supported modes are `view`, `orbit`, `section`, and `list`. `--theme` accepts a built-in theme id, an inline JSON theme object, or a path to a JSON theme file. Set `theme.display.mode` to `solid` or `wireframe` for surface/wire output. `--params` targets `.step.js` STEP module sidecar parameters.

The snapshot daemon is optional and managed by the CLI:

```bash
npm run snapshot -- daemon status
npm run snapshot -- daemon stop
```

## UX Contract

- STEP entries expose face picking from visible GLB triangles and edge picking from selector proxy geometry when topology is available.
- Occurrence, shape, face, and edge references are copied as `@cad[...]` strings.
- DXF entries are read-only flat-pattern views.
- URDF and SDF entries show direct robot/model structure with joint sliders when joints are available.
- SRDF entries show linked-URDF structure, SRDF group-state presets, and optional local MoveIt2 controls when a websocket endpoint is configured.
- The viewer selects one file at a time.
- Sidebar grouping follows the exact active scan-root directory structure.

## Verification

Run the full viewer suite before handing off viewer changes:

```bash
npm run test
npm run build
```

Useful targeted checks:

```bash
node --test --experimental-default-type=module snapshot/snapshot.test.mjs
node --test --experimental-default-type=module lib/themeSettings.test.js
node --test --experimental-default-type=module lib/workbench/sidebar.test.js
node --test --experimental-default-type=module scripts/ensure-dev.test.mjs
```

For UI changes, also open a representative file with `npm run dev:ensure` and verify the app renders, selection works, and the browser console is clean.
