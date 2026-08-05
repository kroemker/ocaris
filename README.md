# Ocaris

Local desktop hub for playing _The Legend of Zelda: Ocarina of Time_ mods. See [WORK_PACKAGES.md](./WORK_PACKAGES.md) for the project's work breakdown.

## Stack

Electron + React + TypeScript (via `electron-vite`), `better-sqlite3` for local storage.

## Development

```sh
npm install
npm run dev        # start the app with hot reload
npm run build       # production build to out/
npm run typecheck   # tsc --noEmit for main/preload and renderer
npm run lint         # eslint
npm run format       # prettier --write
npm run test         # vitest
npm run package:dir  # unpacked packaged build, for testing packaging without a full installer
```

## Project layout

```
src/main            Electron main process (window, lifecycle)
src/main/db         SQLite connection, migrations, and per-entity DAOs
src/main/ipc        ipcMain handlers, one module per feature area
src/main/rom        ROM header verification (N64 header CRC1/CRC2 check)
src/main/emulator   Emulator executable-path validation
src/main/download   Generic HTTP download engine (streaming, progress, cancellation)
src/main/catalog    Pluggable ModCatalogSource interface + hylianmodding.com adapter
src/main/mods       Mod install pipeline (download patch -> apply -> ready)
src/main/storage    Where patches, patched ROMs and cached thumbnails live
src/main/thumbnails Thumbnail download/downscale cache + ocaris-thumb:// handler
src/main/window     Title-bar overlay colors for the current theme
src/preload         contextBridge-exposed, typed API surface for the renderer
src/renderer        React app
src/renderer/src/lib     Pure view logic (filter/sort/status-to-actions), no React
src/renderer/src/styles  Design tokens + component styles
src/renderer/src/theme   Theme preference hook and provider
src/shared          Types/constants shared between main and renderer (e.g. IPC contract)
src/patch           BPS patch engine - no Electron dependency, plain Node/TS
tests/main          Unit tests for main-process modules
tests/renderer      Unit tests for the renderer's pure view logic
tests/patch         Unit tests for the patch engine
```

The SQLite database lives at `app.getPath('userData')/ocaris.db` (e.g. `~/.config/ocaris/ocaris.db` on Linux) and is created/migrated automatically on first launch.

## ROM verification

Ocaris checks a selected ROM's N64 header CRC1/CRC2 (bytes at offset `0x10`) against the known-good values for OoT 1.0 (U), rather than hashing the whole file. This only requires reading the first 24 bytes of the ROM (fast, no full-file I/O) and tolerates the file-format variance (trimmed/padded dumps) that a whole-file SHA-1/CRC32 would flag as different. The known-good header CRC values are sourced from [OoT-Randomizer's own input validation](https://github.com/OoTRandomizer/OoT-Randomizer/blob/Dev/Rom.py) (`valid_crc`), the most authoritative real-world reference for this exact check. See `src/main/rom/checksums.ts`.

A header CRC mismatch is a warning, not a hard block — the user can explicitly choose to proceed with an unverified ROM.

## Patch engine

`src/patch/bps.ts` applies [BPS](https://gist.github.com/khadiwala/32b16f8bb3d0a97e0f60)-format patches to a source ROM buffer and returns the patched output; it never touches the input buffer. BPS patches embed three CRC32 checksums (source, target, and the patch file itself), all of which are verified: a corrupt/truncated patch file is rejected before any patching is attempted, and a patch applied to the wrong source ROM is rejected with a descriptive error rather than silently producing garbage output. `.xdelta` is not supported - only `.bps` patches, which is what the primary catalog candidates in [WORK_PACKAGES.md](./WORK_PACKAGES.md) are expected to use.

This module has no Electron dependency and only deals with in-memory buffers; the main process (in a later work package) is responsible for reading the ROM/patch files from disk and writing the result.

## Data layer

SQLite schema covers four entities: `app_config` (verified ROM + theme preference), `emulators`, `mods` (catalog cache), and `mod_status` (per-mod download/patch state). `mods`/`mod_status` are split so a catalog refresh (`upsertMods`) can update a mod's metadata without ever resetting its in-progress or completed download - only mods the app has never seen before get a fresh `not_downloaded` status row.

`mods.fetched_at` is rewritten on every refresh, so it means "last seen in the catalog", not "added". `mods.first_seen_at` is set on insert and deliberately left out of `upsertMods`' conflict clause, which is what makes a "recently added" sort possible later; existing rows were backfilled from `fetched_at`, so it only becomes meaningful from the next new mod onward.

`runMigrations(db, upToId?)` takes an optional stop point. That's for tests: it's the only way to build the pre-migration schema, insert a row the old way, and check that a backfill actually backfills.

## Catalog source

`src/main/catalog/types.ts` defines `ModCatalogSource` (`fetchCatalog(): Promise<ModRecord[]>`) so the backing source is swappable - see `docs/catalog-source-spec.md` for why. `HylianModdingCatalogSource` (`src/main/catalog/hylianModdingSource.ts`) is the only implementation so far: hylianmodding.com/mods turns out to be a static, same-origin JSON catalog rather than a bespoke API (`/mods/index.json` + `/mods/<id>/mod.json`), fetched with a small concurrency cap rather than ~140 simultaneous requests. Entries are filtered to `supported_games === "OoT"` (the site also lists Majora's Mask mods) and normalized into `ModRecord`, stashing the raw `download_link`/thumbnail/completion-status in the free-form `metadata` column.

Verified against the real live site (not just recorded fixtures) during development: 41 real OoT mods fetched correctly, MM entries filtered out, and both same-origin and external (GitHub Releases) download links resolved as expected. The test suite itself only hits a local HTTP server serving fixtures adapted from that real data, though - no live network dependency in CI or for other contributors.

## Download + install pipeline

`src/main/download/downloadFile.ts` streams an arbitrary URL to disk (temp `.part` file, renamed on success) with progress reporting and `AbortSignal` cancellation; a failed or cancelled download never leaves a file at the destination path.

`src/main/mods/install.ts` chains that with the BPS patch engine, and it turns out that's not as simple as "download the patch and apply it" - see `docs/catalog-source-spec.md`. A mod's `download_link` might be a bare `.bps`, or a `.zip` containing _several_ `.bps` files for different ROM regions/versions with no metadata saying which is which, or something Ocaris can't act on at all (a `.7z`, or a link to a GitHub Releases page rather than a file). `installMod()` classifies the link first (`src/main/mods/resolvePatch.ts`): unsupported types resolve straight to an `error` status ("download manually") without touching the network; a `.zip` gets downloaded and every `.bps` inside it is checked against the verified ROM's checksum until one matches (`findMatchingPatchInZip` - reuses the same embedded-CRC check `src/patch/bps.ts` already does, rather than trying to parse filenames). Either way, `mod_status` is updated throughout (`downloading` → `ready`, or `error` with a message), and `installMod()` never rejects - a bad download or a ROM/patch mismatch are expected, user-facing outcomes that resolve to an `error` status, not exceptions.

## Launching a mod

`src/main/emulator/launch.ts` spawns a configured emulator with a patched ROM's path substituted into its argument template, detached from Ocaris so the emulator keeps running if Ocaris closes. `buildArgv()` splits the template on whitespace _before_ substituting `{romPath}`, so a ROM path containing spaces stays one argv entry instead of being split apart. `launchEmulator()` waits for Node's `spawn`/`error` events rather than assuming `child_process.spawn()` succeeded synchronously - it returns a `ChildProcess` even for a nonexistent executable - so a bad emulator path rejects with a descriptive `LaunchError` instead of failing silently.

The "Play" button lives in the library view (below) once a mod reaches the `ready` state.

## Library view

The main view is a list of media rows - thumbnail, title, author and completion status, a two-line description, and a right rail with the mod's status above its actions. `src/renderer/src/App.tsx` owns the data and the IPC calls; the rows are `ModRow`/`ModRowActions`, the state filters are `FilterChips`.

Which buttons a row offers is decided by `actionsFor()` in `src/renderer/src/lib/library.ts`, which returns them as data rather than markup: `Download` (not-downloaded), `Cancel` plus a live progress bar (downloading), `Play`/`Folder`/`Remove` (ready), or `Retry` plus `Open page` (error). Filtering, sorting and progress formatting live in the same module. Keeping that logic free of React is what lets `tests/renderer/library.test.ts` cover it in the existing Node test environment - no jsdom, no testing-library, no config change.

Progress comes from polling `catalog:list` every 750ms while any mod is downloading, since `installMod` already writes progress to `mod_status` on every chunk. Downloads are uncapped: several mods can install at once, and `mod:cancel` aborts one by id without touching the others.

Filter chip counts are computed against the search-filtered pool, so search and filters compose - typing narrows every chip, not just the list. Search matches names and authors only; a match inside a description would fire on text the row clamps to two lines.

An error replaces a row's description rather than sitting next to it, and `Remove` confirms inline in the rail instead of opening a dialog (re-downloading rebuilds the file).

Verified end-to-end through the real rendered UI (not just IPC calls): seeded a mod pointing at a local HTTP server serving a `.zip` with two `.bps` candidates (one deliberately for the wrong ROM), clicked the actual `Download` button, and watched it correctly pick the matching patch, apply it, write the exact expected patched ROM bytes to disk, and flip to a `Play` button - the brief's "wire catalog -> download -> patch -> play end-to-end for a single mod" milestone.

## Settings dialog

ROM and emulator setup are panes of a settings dialog (`src/renderer/src/components/settings/`), not sections stacked in the main view, alongside Appearance, Catalog, Storage and About.

It's a native `<dialog>` opened with `showModal()`, which brings Esc-to-close, the backdrop, a focus trap and focus restore with it. Its `onClose` fires for Esc as well as an explicit close, so that's the single place that reports the dialog is no longer open.

The Storage pane is read-only: `src/main/storage/paths.ts` is the only thing that decides where patches and patched ROMs live, so making those configurable later is a change in one file rather than a hunt through call sites. `storage:open-folder` takes no path from the renderer - it can only open the app's own directory.

## Theming

One token set in `src/renderer/src/styles/tokens.css`: `:root` is the dark theme, `:root[data-theme='light']` overrides it. The light theme darkens accent/ok/warn/err rather than reusing the dark values, which fail contrast on white.

The preference (`system` | `light` | `dark`) is stored in `app_config.theme` and applied to `nativeTheme.themeSource`. That's what makes `prefers-color-scheme` in the renderer reflect a pinned choice, so `useTheme()` resolves `system` through a single media query and writes `data-theme` on `<html>`. Main applies the stored theme before the first window so `backgroundColor` is painted in the right theme instead of flashing.

## Window chrome

The app's top bar _is_ the window title bar (`titleBarStyle: 'hidden'` plus a `titleBarOverlay`), so there aren't two bars stacked. The overlay's colors are re-applied on every `nativeTheme` `updated` event - that covers both an explicit theme change and the OS flipping while the preference is `system`.

The bar is a drag region with every interactive descendant opted back out; miss one and it stops responding to clicks and moves the window instead. Space for the native window controls comes from `env(titlebar-area-*)` rather than a fixed inset, since the controls sit right on Windows/Linux and left on macOS, where the overlay colors are ignored entirely. `setTitleBarOverlay` throws where no overlay is drawn, so `src/main/window/titleBar.ts` swallows that.

## Thumbnails

What the catalog calls a thumbnail is a full screenshot - measured against the live source, up to 1280x720 and half a megabyte, roughly 8 MB across the catalog, for a 104px box in the row. A catalog refresh downloads any image not already cached into `userData/thumbs`, downscaling to 3x the box with `nativeImage` (no image dependency, nothing new to build at packaging time), and the renderer loads them through an `ocaris-thumb://` handler - `img-src` allows that scheme and no remote host.

Failures are per thumbnail and never propagate: a 404, or a response that isn't a decodable image, just leaves that mod without a cached file, and the row falls back to a generated placeholder tile. The handler takes a mod id and nothing else, and the same sanitisation used for cache file names strips anything outside `[A-Za-z0-9_-]`, so a crafted URL can't escape the cache directory.

Row thumbnails are 4:3 with `object-fit: cover` - the N64's native ratio, and 12 of 18 sampled catalog images match it. The 16:9 minority loses about 17% off each side.

## First run and empty states

A missing ROM owns the whole view and opens settings on the ROM pane on first launch - nothing in the library is usable without one. A missing emulator deliberately does not: mods still browse, download and patch, and only `Play` is disabled. There are three other empty states (nothing cached yet, no matches for the current filter/search, and the ROM case) and one dismissible error banner under the top bar for refresh and launch failures; per-mod install errors stay in their row, next to the retry button.

Filter/sort/search are not persisted across restarts - the app always opens on All / Name (A-Z).

## Packaging

`npm run package:dir` builds an unpacked app (`release/linux-unpacked/` on Linux) via `electron-builder --dir` - runnable directly, no installer step, useful for verifying a packaged build actually works without generating a full AppImage/dmg/nsis installer every time. Full installer targets are configured per-platform in `package.json`'s `build` field (AppImage for Linux, dmg for macOS, nsis for Windows) but only the Linux `--dir` target has actually been built and smoke-tested in this environment.

`npmRebuild` is set to `false`: electron-builder's default native-module rebuild step needs to download Electron's headers, which this environment's network policy blocks. That rebuild would otherwise recompile `better-sqlite3` from source against Electron's Node ABI - but `better-sqlite3` already installs an Electron-aware prebuilt binary via `prebuild-install`, which every smoke test in this project (including one run directly against the packaged `release/linux-unpacked/ocaris` binary, not just `npm run dev`) has exercised successfully. If a future native dependency doesn't ship Electron-compatible prebuilds, this will need revisiting (either restoring `npmRebuild` somewhere with network access, or running `electron-rebuild` manually).

No app icon yet - packaged builds use Electron's default icon. Cosmetic, not blocking.

### Dependency deprecation warnings

`npm install` used to print four `npm warn deprecated` lines - all from packages several levels deep inside `electron-builder`'s own dependency tree (`@electron/asar` for asar packing, `electron-winstaller` for the Windows installer target), never from anything Ocaris depends on directly, and never bundled into the shipped app (electron-builder is a devDependency only; none of these end up in `out/` or `release/`).

- `glob@7.2.3` and `inflight@1.0.6` (glob's own dependency): fixed via a top-level `overrides` entry pinning `glob` to `^13.0.6`, which drops the `inflight`-based caching entirely. Verified this doesn't break packaging, not just assumed it: ran `npm run package:dir` and smoke-tested the actual packaged `release/linux-unpacked/ocaris` binary (launches, creates and migrates its SQLite DB correctly) with the override in place, since `@electron/asar` is exactly the code that exercises `glob` during packaging.
- `rimraf@2.6.3`: same approach, overridden to `^6.1.3`, same verification.
- `boolean@3.2.0`: **not fixable** - 3.2.0 is the last version ever published; the package is permanently abandoned with no successor. The `npm warn deprecated boolean@3.2.0` line will keep appearing until `electron-builder`'s own dependency chain (`@electron/get` → `global-agent` → `boolean`) drops it upstream. Confirmed via `npm view boolean version` (still 3.2.0) and `npm view boolean deprecated` (permanent, not a redirect to a new package name).

`npm audit` reports 0 vulnerabilities before and after - these were maintenance-status warnings, not security issues.
