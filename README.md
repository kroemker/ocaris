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
src/preload         contextBridge-exposed, typed API surface for the renderer
src/renderer        React app
src/shared          Types/constants shared between main and renderer (e.g. IPC contract)
src/patch           BPS patch engine - no Electron dependency, plain Node/TS
tests/main          Unit tests for main-process modules
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

SQLite schema covers four entities: `app_config` (verified ROM), `emulators`, `mods` (catalog cache), and `mod_status` (per-mod download/patch state). `mods`/`mod_status` are split so a catalog refresh (`upsertMods`) can update a mod's metadata without ever resetting its in-progress or completed download - only mods the app has never seen before get a fresh `not_downloaded` status row.

## Catalog source

`src/main/catalog/types.ts` defines `ModCatalogSource` (`fetchCatalog(): Promise<ModRecord[]>`) so the backing source is swappable - see `docs/catalog-source-spec.md` for why. `HylianModdingCatalogSource` (`src/main/catalog/hylianModdingSource.ts`) is the only implementation so far: hylianmodding.com/mods turns out to be a static, same-origin JSON catalog rather than a bespoke API (`/mods/index.json` + `/mods/<id>/mod.json`), fetched with a small concurrency cap rather than ~140 simultaneous requests. Entries are filtered to `supported_games === "OoT"` (the site also lists Majora's Mask mods) and normalized into `ModRecord`, stashing the raw `download_link`/thumbnail/completion-status in the free-form `metadata` column.

Verified against the real live site (not just recorded fixtures) during development: 41 real OoT mods fetched correctly, MM entries filtered out, and both same-origin and external (GitHub Releases) download links resolved as expected. The test suite itself only hits a local HTTP server serving fixtures adapted from that real data, though - no live network dependency in CI or for other contributors.

## Download + install pipeline

`src/main/download/downloadFile.ts` streams an arbitrary URL to disk (temp `.part` file, renamed on success) with progress reporting and `AbortSignal` cancellation; a failed or cancelled download never leaves a file at the destination path.

`src/main/mods/install.ts` chains that with the BPS patch engine, and it turns out that's not as simple as "download the patch and apply it" - see `docs/catalog-source-spec.md`. A mod's `download_link` might be a bare `.bps`, or a `.zip` containing _several_ `.bps` files for different ROM regions/versions with no metadata saying which is which, or something Ocaris can't act on at all (a `.7z`, or a link to a GitHub Releases page rather than a file). `installMod()` classifies the link first (`src/main/mods/resolvePatch.ts`): unsupported types resolve straight to an `error` status ("download manually") without touching the network; a `.zip` gets downloaded and every `.bps` inside it is checked against the verified ROM's checksum until one matches (`findMatchingPatchInZip` - reuses the same embedded-CRC check `src/patch/bps.ts` already does, rather than trying to parse filenames). Either way, `mod_status` is updated throughout (`downloading` → `ready`, or `error` with a message), and `installMod()` never rejects - a bad download or a ROM/patch mismatch are expected, user-facing outcomes that resolve to an `error` status, not exceptions.

## Launching a mod

`src/main/emulator/launch.ts` spawns a configured emulator with a patched ROM's path substituted into its argument template, detached from Ocaris so the emulator keeps running if Ocaris closes. `buildArgv()` splits the template on whitespace _before_ substituting `{romPath}`, so a ROM path containing spaces stays one argv entry instead of being split apart. `launchEmulator()` waits for Node's `spawn`/`error` events rather than assuming `child_process.spawn()` succeeded synchronously - it returns a `ChildProcess` even for a nonexistent executable - so a bad emulator path rejects with a descriptive `LaunchError` instead of failing silently.

The "Play" button lives in the mod catalog UI (below) once a mod reaches the `ready` state.

## Mod catalog UI

`CatalogBrowser` (`src/renderer/src/components/CatalogBrowser.tsx`) ties everything above together: refresh the catalog, browse cached mods, and per mod - `Download` (not-downloaded), a live progress line (`downloading`, polling `catalog:list` every 750ms while any mod is downloading, since `installMod`'s progress callback already writes to `mod_status` on every chunk), `Play` (`ready`, disabled until an emulator is configured), or the error message plus `Retry` and an `Open download page` button for mods Ocaris can't install automatically (`shell:open-external`, restricted to `http(s)://` URLs).

Verified end-to-end through the real rendered UI (not just IPC calls): seeded a mod pointing at a local HTTP server serving a `.zip` with two `.bps` candidates (one deliberately for the wrong ROM), clicked the actual `Download` button, and watched it correctly pick the matching patch, apply it, write the exact expected patched ROM bytes to disk, and flip to a `Play` button - the brief's "wire catalog → download → patch → play end-to-end for a single mod" milestone.

## First-run flow and other UX polish

`App.tsx` gates the UI in setup order: `EmulatorSetup` only renders once a ROM is configured, and `CatalogBrowser` only once at least one emulator exists too - each gate shows guidance pointing at the previous step instead of an empty/broken-looking section. `RomSetup`/`EmulatorSetup` report their state up to `App` via an `onConfigChange`/`onChange` prop (called after every successful mutation, not just on mount) rather than a bigger state-management refactor.

`CatalogBrowser` also got a `Browse all` / `My library` toggle (library = `ready` mods only), and a real bug fix: `handlePlay` previously let a failed `emulator:launch` call disappear as an unhandled rejection - it's now caught and shown the same way other errors in this component are.

Not done: a shared toast/notification component (each section already surfaces its own errors inline via `role="alert"`, which covers the same ground without a new abstraction) and a single consolidated "library" view separate from the catalog browser (the toggle above covers the same need without a second component).

## Packaging

`npm run package:dir` builds an unpacked app (`release/linux-unpacked/` on Linux) via `electron-builder --dir` - runnable directly, no installer step, useful for verifying a packaged build actually works without generating a full AppImage/dmg/nsis installer every time. Full installer targets are configured per-platform in `package.json`'s `build` field (AppImage for Linux, dmg for macOS, nsis for Windows) but only the Linux `--dir` target has actually been built and smoke-tested in this environment.

`npmRebuild` is set to `false`: electron-builder's default native-module rebuild step needs to download Electron's headers, which this environment's network policy blocks. That rebuild would otherwise recompile `better-sqlite3` from source against Electron's Node ABI - but `better-sqlite3` already installs an Electron-aware prebuilt binary via `prebuild-install`, which every smoke test in this project (including one run directly against the packaged `release/linux-unpacked/ocaris` binary, not just `npm run dev`) has exercised successfully. If a future native dependency doesn't ship Electron-compatible prebuilds, this will need revisiting (either restoring `npmRebuild` somewhere with network access, or running `electron-rebuild` manually).

No app icon yet - packaged builds use Electron's default icon. Cosmetic, not blocking.
