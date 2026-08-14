# Ocaris — design notes

Why each subsystem is built the way it is. The [README](../README.md) covers what the app does and how to build it; this file is the running commentary behind it.

## ROM verification

Ocaris checks a selected ROM's N64 header CRC1/CRC2 (bytes at offset `0x10`) against the known-good values for OoT 1.0 (U), rather than hashing the whole file. This only requires reading the first 24 bytes of the ROM (fast, no full-file I/O) and tolerates the file-format variance (trimmed/padded dumps) that a whole-file SHA-1/CRC32 would flag as different. The known-good header CRC values are sourced from [OoT-Randomizer's own input validation](https://github.com/OoTRandomizer/OoT-Randomizer/blob/Dev/Rom.py) (`valid_crc`), the most authoritative real-world reference for this exact check. See `src/main/rom/checksums.ts`.

A header CRC mismatch is a warning, not a hard block — the user can explicitly choose to proceed with an unverified ROM.

## Patch engine

`src/patch/bps.ts` applies [BPS](https://gist.github.com/khadiwala/32b16f8bb3d0a97e0f60)-format patches to a source ROM buffer and returns the patched output; it never touches the input buffer. BPS patches embed three CRC32 checksums (source, target, and the patch file itself), all of which are verified: a corrupt/truncated patch file is rejected before any patching is attempted, and a patch applied to the wrong source ROM is rejected with a descriptive error rather than silently producing garbage output. `.xdelta` is not supported - only `.bps` patches, which is what the primary catalog candidates in [WORK_PACKAGES.md](../WORK_PACKAGES.md) are expected to use.

This module has no Electron dependency and only deals with in-memory buffers; the main process is responsible for reading the ROM/patch files from disk and writing the result.

## Data layer

SQLite schema covers five entities: `app_config` (verified ROM, theme preference, persisted UI state), `emulators`, `mods` (catalog cache), `mod_status` (per-mod download/patch state) and `mod_prefs` (per-mod user choices, below). `mods`/`mod_status` are split so a catalog refresh (`upsertMods`) can update a mod's metadata without ever resetting its in-progress or completed download - only mods the app has never seen before get a fresh `not_downloaded` status row.

`mods.fetched_at` is rewritten on every refresh, so it means "last seen in the catalog", not "added". `mods.first_seen_at` is set on insert and deliberately left out of `upsertMods`' conflict clause, which is what backs the "Recently added" sort and the row's `New` badge (anything first seen in the last seven days); existing rows were backfilled from `fetched_at`, so it only becomes meaningful from the next new mod onward.

`runMigrations(db, upToId?)` takes an optional stop point. That's for tests: it's the only way to build the pre-migration schema, insert a row the old way, and check that a backfill actually backfills.

## Catalog sources

`src/main/catalog/types.ts` defines `ModCatalogSource` (`fetchCatalog(): Promise<ModRecord[]>`); two implement it, and a refresh fetches both. See [catalog-source-spec.md](./catalog-source-spec.md) for how each was reverse-engineered and what its data is actually like.

- **`HylianModdingCatalogSource`** - hylianmodding.com/mods turns out to be a static, same-origin JSON catalog rather than a bespoke API (`/mods/index.json` + `/mods/<id>/mod.json`), fetched with a small concurrency cap rather than ~140 simultaneous requests. Filtered to `supported_games === "OoT"`; 41 mods. It hosts real patch files, which is why it's the primary source.
- **`ZeldaFandomCatalogSource`** - zelda-64-mods.fandom.com is a MediaWiki, so its read API serves the whole `Category:Ocarina of Time Mods` (132 mods) and every page's wikitext in ~6 requests. `src/main/catalog/wikitext.ts` reads the `{{Infobox_mod}}` and the blurb out of that. Broader but looser: two thirds of its download links point at a MediaFire/Drive/Discord landing page, and those rows offer "Open page" rather than a Download button that could only fail.

`src/main/catalog/merge.ts` folds them into one row per mod - 36 of hylianmodding's 41 also have a wiki page. The primary source keeps its id, so a mod the user already installed doesn't lose its status when a second catalog starts describing it; the merged row takes the longest description and, crucially, whichever download link the installer can actually use. Live, that's 137 rows of which 66 are installable, against 41 rows and 29 installable from hylianmodding alone.

A source that's unreachable is reported in Settings and skipped; the others still refresh. Both were verified against the live sites during development, but the test suite only hits a local HTTP server serving fixtures adapted from that real data - no live network dependency in CI or for other contributors.

## Download + install pipeline

`src/main/download/downloadFile.ts` streams an arbitrary URL to disk (temp `.part` file, renamed on success) with progress reporting and `AbortSignal` cancellation; a failed or cancelled download never leaves a file at the destination path.

`src/main/mods/install.ts` chains that with the BPS patch engine, and it turns out that's not as simple as "download the patch and apply it" - see [catalog-source-spec.md](./catalog-source-spec.md). A mod's `download_link` might be a bare `.bps`, or a `.zip` containing _several_ `.bps` files for different ROM regions/versions with no metadata saying which is which, or something Ocaris can't act on at all (a `.7z`, or a link to a GitHub Releases page rather than a file). `installMod()` classifies the link first (`src/main/mods/resolvePatch.ts`): unsupported types resolve straight to an `error` status ("download manually") without touching the network; a `.zip` gets downloaded and every `.bps` inside it is checked against the verified ROM's checksum until one matches (`findMatchingPatchInZip` - reuses the same embedded-CRC check `src/patch/bps.ts` already does, rather than trying to parse filenames). Either way, `mod_status` is updated throughout (`downloading` → `ready`, or `error` with a message), and `installMod()` never rejects - a bad download or a ROM/patch mismatch are expected, user-facing outcomes that resolve to an `error` status, not exceptions.

## Launching a mod

`src/main/emulator/launch.ts` spawns a configured emulator with a patched ROM's path substituted into its argument template, detached from Ocaris so the emulator keeps running if Ocaris closes. `buildArgv()` splits the template on whitespace _before_ substituting `{romPath}`, so a ROM path containing spaces stays one argv entry instead of being split apart. `launchEmulator()` waits for Node's `spawn`/`error` events rather than assuming `child_process.spawn()` succeeded synchronously - it returns a `ChildProcess` even for a nonexistent executable - so a bad emulator path rejects with a descriptive `LaunchError` instead of failing silently.

The "Play" button lives in the library view once a mod reaches the `ready` state.

## Library view

The main view is a list of media rows - thumbnail, title, author and completion status, a two-line description, and a right rail with the mod's status above its actions. `src/renderer/src/App.tsx` owns the data and the IPC calls; the rows are `ModRow`/`ModRowActions`, the state filters are `FilterChips`.

Which buttons a row offers is decided by `actionsFor()` in `src/renderer/src/lib/library.ts`, which returns them as data rather than markup: `Download` (not-downloaded), `Cancel` plus a live progress bar (downloading), `Play`/`Folder`/`Remove` (ready), or `Retry` plus `Open page` (error). Filtering, sorting and progress formatting live in the same module. Keeping that logic free of React is what lets `tests/renderer/library.test.ts` cover it in the existing Node test environment - no jsdom, no testing-library, no config change.

Progress is pushed, not polled: the `mod:install` handler passes an `onProgress` into `installMod` that sends a `mod:progress` event to the window that asked for the install, and the renderer patches that one row's status in place. `src/main/mods/throttleProgress.ts` caps that at one event per 200ms - `downloadFile` reports every chunk, which is hundreds of times a second on a fast connection - and emits on the leading edge with no trailing call, because the handler's return value is what settles the final state. The renderer drops progress for any mod it doesn't have an install request in flight for, so an event that arrives just after a cancel can't put the row back into `downloading`.

Downloads are uncapped: several mods can install at once, and `mod:cancel` aborts one by id without touching the others.

## Per-mod preferences

Favourites and a per-mod emulator live in their own `mod_prefs` table rather than in more `mod_status` columns, because `mod:remove` resets a status row wholesale and neither should die with the patched ROM. Rows are written lazily - a catalog of 137 mods nobody has touched stores nothing - so every read is a `LEFT JOIN` with a fallback to `DEFAULT_MOD_PREFS`.

`mod_prefs.emulator_id` is a real foreign key with `ON DELETE SET NULL`, so deleting an emulator clears the mods that pointed at it instead of leaving dangling ids. The renderer doesn't rely on that alone: `emulatorForMod()` falls back to the global default for an id it can't resolve, since the alternative is a row that won't play until the user finds a setting they don't remember making. Picking an emulator from the Play menu is also what sets the override - there's no separate "remember this" step - and the menu tags it `this mod` to distinguish it from the app-wide `default`.

Favouriting is a star beside the mod's name, in the row and in the details dialog's header - one control, in the same place, whatever state the mod is in. Hiding was dropped: it was a second way to put a mod away that only paid off for a library far larger than this one. `mod_prefs.hidden` survives as a column so old rows still read back, but nothing writes or reads it, and the "Hidden" filter is gone - a stored `filter: 'hidden'` normalizes back to `all`.

## Mod details dialog

The row clamps its description to two lines and drops most of what the catalogs provide, so the title and thumbnail open a details dialog (`ModDetails.tsx`) with the full text, every source's page, when the mod was first seen, the patched ROM's path and the per-mod emulator picker. It follows the mod by id rather than holding a copy, so a row that finishes downloading updates underneath the open dialog. `Remove` is deliberately absent: deleting a file confirms in place in the row's rail, and duplicating that flow in a dialog would mean a second confirmation path.

Filter chip counts are computed against the search-filtered pool, so search and filters compose - typing narrows every chip, not just the list. Search matches names and authors only; a match inside a description would fire on text the row clamps to two lines.

An error replaces a row's description rather than sitting next to it, and `Remove` confirms inline in the rail instead of opening a dialog (re-downloading rebuilds the file).

Verified end-to-end through the real rendered UI (not just IPC calls): seeded a mod pointing at a local HTTP server serving a `.zip` with two `.bps` candidates (one deliberately for the wrong ROM), clicked the actual `Download` button, and watched it correctly pick the matching patch, apply it, write the exact expected patched ROM bytes to disk, and flip to a `Play` button - the brief's "wire catalog -> download -> patch -> play end-to-end for a single mod" milestone.

## Settings dialog

ROM and emulator setup are panes of a settings dialog (`src/renderer/src/components/settings/`), not sections stacked in the main view, alongside Appearance, Catalog, Storage and About.

It's a native `<dialog>` opened with `showModal()`, which brings Esc-to-close, the backdrop, a focus trap and focus restore with it. Its `onClose` fires for Esc as well as an explicit close, so that's the single place that reports the dialog is no longer open.

The Storage pane is read-only: `src/main/storage/paths.ts` is the only thing that decides where patches and patched ROMs live, so making those configurable later is a change in one file rather than a hunt through call sites. `storage:open-folder` takes no path from the renderer - it can only open the app's own directory.

## Emulator registry, icons and auto-detect

`src/shared/emulators/registry.ts` is a small curated list of common N64 emulators (Project64, RetroArch, simple64, Rosalie's Mupen GUI, ares) - pure data (id, per-platform default args, executable names, install-path candidates), no Node/Electron APIs, so it's importable from both the main process and the renderer. Picking a known emulator seeds the existing name/path/args form (`src/renderer/src/lib/emulatorPicker.ts`'s `seedFromKnown`) rather than replacing it - every field stays editable afterward, and adding an emulator that isn't in the list is still one click away via the "Other" tile.

Icons are original in-house SVG-style badges (`EmulatorIcon`, reusing `ModThumbnail`'s deterministic hue+initials technique via `src/renderer/src/lib/badge.ts`), not official project logos - bundling trademarked logos into the repo isn't something to do without sourcing/verifying a license for each one, so this ships a placeholder per entry instead. The registry keys icons by `knownId`, so real artwork can replace a badge later without touching any other code.

`src/main/emulator/detect.ts` scans for installed emulators: each registry entry's known install-path candidates (with `{home}`/`{programFiles}`/`{programFilesX86}` tokens resolved per-OS) plus every directory on `PATH`, reusing `validateExecutablePath` so a same-named-but-non-executable file doesn't count as a match. It's exposed as an explicit "Scan for installed emulators" action in the Emulators pane, not an automatic background scan - a hit still lands in the same review-before-save form as picking from the grid, it's just pre-filled with the path found on disk.

`emulators.known_id`/`kind` (`'known' | 'custom'`) record which registry entry (if any) an emulator config was seeded from, purely for display (showing its icon again in the list) - they're set once on insert and never touched by an edit, so renaming or repointing a "known" emulator's path doesn't reclassify it as custom.

Known emulators can also be auto-installed rather than just detected. A registry entry optionally carries a `download` source (`EmulatorDownloadSource`) - a GitHub repo plus a per-platform regex matched against that repo's latest release assets, since an exact filename would go stale the moment a new version ships. `src/main/emulator/install.ts`'s `installKnownEmulator` fetches the latest release (`src/main/emulator/github.ts`), downloads the matching asset with the same `downloadFile` used for mod patches, extracts it with `adm-zip` (or, for a single-file asset like an AppImage, just marks it executable) into `<storageRoot>/emulators/<knownId>`, and locates the binary inside via the same `executableNames` auto-detect already uses. Like `installMod`, it never throws - failures and cancellation both resolve to a result object - and only carries a `download` entry for emulators that are actually open-source and publish real per-platform build artifacts as GitHub release assets; Project64 (closed-source, no stable download URL) and RetroArch (its releases are changelog markers, not where its builds are published) are deliberately left without one, so those tiles stay manual/detect-only.

## Self-update

`src/main/update/updater.ts` turns electron-updater's seven events into one state machine (`unsupported | idle | checking | available | downloading | ready | error`) that the renderer can render directly, and takes the `UpdaterLike` interface it drives as an argument - the real `autoUpdater` reaches for the network, the packaging metadata and, on `quitAndInstall`, the process itself, none of which belongs in a test.

`autoDownload` is off: pulling ~100 MB in the background on a metered connection isn't a decision to make for someone. `autoInstallOnAppQuit` is on, so consenting to the download is the last thing required - the "Restart now" button is a shortcut, not the only path.

Nothing in the module throws. A machine that is offline at launch has to produce a quiet `error` status, not an unhandled rejection or a dialog, and `checkForUpdates()` rejects before emitting an `error` event in exactly that case - which is why both the promise and the event are handled.

`unsupported` is a first-class state rather than an error, for the two cases that genuinely cannot update: a dev run (there is no installed app to replace) and macOS (Squirrel.Mac refuses anything not signed with a Developer ID certificate). Both say why, so the pane explains itself instead of offering a button that could only fail. Nothing is wired to the real updater in those cases - `check()` never touches the network.

The check happens once, ten seconds after launch, and otherwise only on request. No polling loop: a desktop app left open for days can wait for the next launch. Progress is throttled through the same `src/main/util/throttle.ts` the mod installer uses.

The renderer keeps its share in `src/renderer/src/lib/update.ts` (status → headline, detail, one action), which is what makes every state coverable without a DOM. `useUpdateStatus()` is deliberately safe to call from more than one component, unlike `useUiState`: it only reads, and main broadcasts each change to every window, so the banner and the About pane cannot disagree. Only `ready` earns the banner - an available or downloading update stays in Settings, where the user went looking for it.

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

## Packaging

`npm run package:dir` builds an unpacked app (`release/linux-unpacked/` on Linux) via `electron-builder --dir` - runnable directly, no installer step, useful for verifying a packaged build actually works without generating a full AppImage/dmg/nsis installer every time. Full installer targets are configured per-platform in `package.json`'s `build` field (AppImage for Linux, dmg for macOS, nsis for Windows) but only the Linux `--dir` target has actually been built and smoke-tested in this environment.

`npmRebuild` is set to `false`: electron-builder's default native-module rebuild step needs to download Electron's headers, which this environment's network policy blocks. That rebuild would otherwise recompile `better-sqlite3` from source against Electron's Node ABI - but `better-sqlite3` already installs an Electron-aware prebuilt binary via `prebuild-install`, which every smoke test in this project (including one run directly against the packaged `release/linux-unpacked/ocaris` binary, not just `npm run dev`) has exercised successfully. If a future native dependency doesn't ship Electron-compatible prebuilds, this will need revisiting (either restoring `npmRebuild` somewhere with network access, or running `electron-rebuild` manually).

The app icon is a single 1254x1254 `resources/icon.png`, pointed at from each platform's `build` entry: electron-builder converts it to the `.ico` Windows embeds in the executable and the `.icns` macOS wants, so there is one file to replace rather than three. `resources/**` is in `files` because the main process also imports it (`?asset`, which resolves relative to the app root, not into `out/`) to set the window icon on Linux - the one platform that takes it from the window rather than from the executable or the bundle.

### Publishing

`publish` points at the GitHub repo (public, so an in-app updater can fetch release assets without a token - a private repo would need one, and an app cannot ship one) with `releaseType: draft`, so `npm run release` uploads into a draft nobody sees until it is published by hand.

The artifact that makes self-update possible is not the installer but the `latest.yml` electron-builder writes beside it: version, file name, size and a sha512 the updater checks the download against. macOS carries `zip` alongside `dmg` for the same reason - the mac feed is built from the zip, and a dmg alone produces nothing updatable. Both exist ahead of the updater itself, because the first release that can be updated *from* has to already contain all of this; see [app-update-plan.md](./app-update-plan.md).

### Dependency deprecation warnings

`npm install` used to print four `npm warn deprecated` lines - all from packages several levels deep inside `electron-builder`'s own dependency tree (`@electron/asar` for asar packing, `electron-winstaller` for the Windows installer target), never from anything Ocaris depends on directly, and never bundled into the shipped app (electron-builder is a devDependency only; none of these end up in `out/` or `release/`).

- `glob@7.2.3` and `inflight@1.0.6` (glob's own dependency): fixed via a top-level `overrides` entry pinning `glob` to `^13.0.6`, which drops the `inflight`-based caching entirely. Verified this doesn't break packaging, not just assumed it: ran `npm run package:dir` and smoke-tested the actual packaged `release/linux-unpacked/ocaris` binary (launches, creates and migrates its SQLite DB correctly) with the override in place, since `@electron/asar` is exactly the code that exercises `glob` during packaging.
- `rimraf@2.6.3`: same approach, overridden to `^6.1.3`, same verification.
- `boolean@3.2.0`: **not fixable** - 3.2.0 is the last version ever published; the package is permanently abandoned with no successor. The `npm warn deprecated boolean@3.2.0` line will keep appearing until `electron-builder`'s own dependency chain (`@electron/get` → `global-agent` → `boolean`) drops it upstream. Confirmed via `npm view boolean version` (still 3.2.0) and `npm view boolean deprecated` (permanent, not a redirect to a new package name).

`npm audit` reports 0 vulnerabilities before and after - these were maintenance-status warnings, not security issues.
