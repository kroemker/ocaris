# Ocaris

Local desktop hub for playing _The Legend of Zelda: Ocarina of Time_ mods: browse a merged catalog of community mods, download and patch them against your own ROM, and launch them in the emulator of your choice.

Ocaris never distributes or bundles a ROM. You point it at a copy you already own; it verifies it, keeps the path, and writes patched copies into its own storage directory.

## Features

- **Mod catalog** — merged from hylianmodding.com and the zelda-64-mods Fandom wiki (~137 mods, ~66 directly installable), cached locally with thumbnails.
- **One-click install** — downloads a mod's `.bps` patch (or picks the right one out of a `.zip` by checksum), applies it to your verified ROM, and writes a ready-to-play copy.
- **Play** — launches a configured emulator with the patched ROM, detached, so Ocaris can close.
- **Emulator setup** — curated registry of common N64 emulators (Project64, RetroArch, simple64, Rosalie's Mupen GUI, ares) with scan-for-installed, auto-install from GitHub releases where available, and fully custom entries.
- **ROM verification** — checks the N64 header CRC1/CRC2 against known-good OoT 1.0 (U) values; a mismatch warns rather than blocks.
- **Library view** — search, state filters, sorting (including recently added), live download progress, cancel and remove.
- **Per-mod choices** — favorite, hide, and pick the emulator a given mod launches with; a details view for the full description, sources and paths.
- **Themes** — dark/light/system, applied to the window chrome as well as the UI.

## Requirements

- Node.js 20+ and npm (for building from source).
- An OoT 1.0 (U) ROM you own.
- An N64 emulator (Ocaris can detect or install several).

## Development

```sh
npm install
npm run dev          # start the app with hot reload
npm run build        # production build to out/
npm run typecheck    # tsc --noEmit for main/preload and renderer
npm run lint         # eslint
npm run format       # prettier --write
npm run test         # vitest
npm run package:dir  # unpacked packaged build, for testing packaging without a full installer
```

Stack: Electron + React + TypeScript (via `electron-vite`), `better-sqlite3` for local storage.

The SQLite database lives at `app.getPath('userData')/ocaris.db` (e.g. `~/.config/ocaris/ocaris.db` on Linux) and is created/migrated automatically on first launch.

## Project layout

```
src/main            Electron main process (window, lifecycle)
src/main/db         SQLite connection, migrations, and per-entity DAOs
src/main/ipc        ipcMain handlers, one module per feature area
src/main/rom        ROM header verification (N64 header CRC1/CRC2 check)
src/main/emulator   Emulator path validation, launch, auto-detect and install
src/main/download   Generic HTTP download engine (streaming, progress, cancellation)
src/main/catalog    ModCatalogSource interface, hylianmodding + wiki adapters, merge
src/main/mods       Mod install pipeline (download patch -> apply -> ready)
src/main/storage    Where patches, patched ROMs and cached thumbnails live
src/main/thumbnails Thumbnail download/downscale cache + ocaris-thumb:// handler
src/main/window     Title-bar overlay colors and window bounds persistence
src/preload         contextBridge-exposed, typed API surface for the renderer
src/renderer        React app
src/renderer/src/lib     Pure view logic (filter/sort/status-to-actions), no React
src/renderer/src/styles  Design tokens + component styles
src/renderer/src/theme   Theme preference hook and provider
src/shared          Types/constants shared between main and renderer (e.g. IPC contract)
src/shared/emulators Curated known-N64-emulator registry (pure data, no Node/Electron APIs)
src/patch           BPS patch engine - no Electron dependency, plain Node/TS
tests/              Unit tests, mirroring the src/ layout
```

## Packaging

`npm run package:dir` builds an unpacked app (`release/linux-unpacked/` on Linux) via `electron-builder --dir` — runnable directly, no installer step. Full installer targets are configured per-platform in `package.json`'s `build` field (AppImage for Linux, dmg for macOS, nsis for Windows).

`npmRebuild` is set to `false`; see [docs/design-notes.md](./docs/design-notes.md#packaging) for why, and for the dependency-deprecation notes.

## Releasing

```sh
npm version minor        # bumps package.json and creates the vX.Y.Z tag
GH_TOKEN=<token> npm run release
```

`npm run release` builds and uploads the installers for the current platform to a **draft** GitHub release, along with the `latest*.yml` manifests an in-app updater reads. Releases stay drafts until published by hand, and each platform's artifacts have to be built on that platform (or by CI).

## Documentation

- [docs/design-notes.md](./docs/design-notes.md) — how each subsystem works and why it's built that way.
- [docs/catalog-source-spec.md](./docs/catalog-source-spec.md) — how each catalog source was reverse-engineered and what its data is actually like.
- [docs/ideas.md](./docs/ideas.md) — candidate features, not yet scheduled.
- [WORK_PACKAGES.md](./WORK_PACKAGES.md) — the project's work breakdown.
