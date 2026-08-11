# Ocaris — feature ideas

Candidates, not commitments. Roughly ordered by value-per-effort within each group. Anything already scheduled lives in [WORK_PACKAGES.md](../WORK_PACKAGES.md).

## Close to what already exists

- **Per-mod emulator arguments.** The emulator to launch with is now remembered per mod; a per-mod argument override (a mod that needs a specific flag) is the same table and one more column.
- **Sort by size / duration / difficulty.** The wiki infobox carries fields the merged row currently discards.
- **Screenshots in the details dialog.** It shows the one cached thumbnail; the catalogs often have several images per mod.
- **App icon.** Packaged builds still use Electron's default. Needs a designed asset, not just wiring.

Done since this list was written: pushed `mod:progress` events instead of the 750ms poll, the "Recently added" sort and `New` badge, favorites/hide, the per-mod emulator override and the details dialog. The patched-ROM output directory was already configurable (Settings → Storage).

## Install pipeline

- **Update detection.** Catalogs carry versions; compare against the installed patch and offer a re-patch when a mod ships a new release. Needs a `version` column on `mod_status` and a "Update available" state.
- **More patch formats.** `.xdelta` (via a vendored decoder or a bundled binary) and `.ips` would move a chunk of the 71 non-installable rows into installable. `.7z` needs a real archive dep.
- **Manual patch import.** Drag a `.bps`/`.zip` onto a row (or onto the window) and run it through the same install pipeline — covers every mod whose download link is a MediaFire/Drive landing page Ocaris can't follow.
- **Multi-ROM support.** OoT 1.0 (U) is hardcoded; MM, OoT Debug and other regions are the same pipeline with different known-good CRCs. Turns `app_config.rom_path` into a `roms` table and lets a mod declare which base it needs.
- **Retry with backoff / resume.** Downloads restart from zero today; a `.part` file plus `Range` requests would survive a flaky connection.
- **Checksum display on failure.** When no `.bps` in a zip matches, show what the patches expect vs. what the ROM is — currently just "no matching patch".

## Catalog

- **More sources.** The `ModCatalogSource` interface is one method; GitHub-release-based mods (Ship of Harkinian ports, randomizer distributions) and modding Discord-adjacent indexes are the obvious next ones.
- **Background/scheduled refresh.** On launch plus every N hours, instead of only on demand.
- **Offline-first messaging.** The cache already survives; make "you're offline, showing the catalog from <date>" explicit rather than an error banner.
- **Local overrides.** A user-editable JSON that patches or adds catalog rows, for mods the sources get wrong.

## Beyond patching

- **Randomizer integration.** OoT Randomizer is the single biggest thing in this ecosystem and is not a BPS patch — it's a generator with a settings file. Wrapping it (settings presets, seed generation, spoiler-log handling) is a whole feature area, but it's what most users' "play a mod" actually means.
- **Save-file management.** Back up / restore / per-mod isolation of emulator saves and save states, so switching mods doesn't stomp them.
- **Playtime tracking.** The launch is already a tracked child process; recording session length and last-played is nearly free and feeds a "recently played" shelf.
- **Texture pack / HD asset handling.** Emulator-side, per-mod, and a common source of "why does mine look different".
- **Controller profile hints.** Store the recommended input mapping a mod's page mentions, surface it next to Play.

## Polish and platform

- **Grid/cover view** alongside the current list, with the larger cached screenshots put to use.
- **Keyboard-first navigation.** `/` to search, arrows through rows, Enter to play — the list is already a flat structure.
- **In-app updater.** `electron-updater` against GitHub releases, once installers are actually published.
- **Windows/macOS packaging verification.** Only the Linux `--dir` target has been built and smoke-tested.
- **Accessibility pass.** Focus order, live-region announcements for download state, contrast audit of both themes.
- **Localization.** The UI string count is still small enough that extracting them is cheap now and expensive later.
