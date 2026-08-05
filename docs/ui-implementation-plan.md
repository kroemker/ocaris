# UI implementation plan — Midnight media-row library

Target: [`docs/ui-mockup-midnight.html`](./ui-mockup-midnight.html) (layout + Midnight dark/light themes).
Exploration that led there: [`docs/ui-mockups.html`](./ui-mockups.html) (10 layouts), [`docs/ui-mockup-library.html`](./ui-mockup-library.html) (20 color/font themes).

The mockup replaces the whole current renderer: `App.tsx` stacks `RomSetup` → `EmulatorSetup` → `CatalogBrowser` as unstyled sections; the target is a single library view with setup moved into a settings dialog.

---

## What the mockup needs that the app doesn't have yet

Found while checking the mockup against `src/shared/ipc.ts`, the DB schema, and the CSP. These drive the phase ordering.

| #   | Gap                                                                                                                                                                                           | Impact                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **CSP blocks remote thumbnails.** `src/renderer/index.html` sets `default-src 'self'` with no `img-src`, so `ModSummary.thumbnailUrl` (an `https://hylianmodding.com/...` URL) will not load. | Thumbnails are the reason variant 2 was chosen. Needs a decision — see phase 4.                               |
| 2   | **No mod size.** The mockup's meta line shows `32.0 MB`. Nothing in `ModRecord`/`metadata` carries a size; `downloadTotalBytes` only exists once a download is in flight.                     | Drop size from the meta line (show it only inside the downloading state, where it's real).                    |
| 3   | **Sort options aren't backed by data.** "Recently added" — `mods.fetched_at` is rewritten on every `upsertMods`, so it means "last seen in a refresh", not "added". "Size" — see #2.          | Ship Name / Author / Status sorts. Add a `first_seen_at` column later if "recently added" is actually wanted. |
| 4   | **No theme persistence.** `app_config` has only ROM columns; no `nativeTheme` wiring in `src/main/index.ts`.                                                                                  | Migration + IPC + main-process wiring (phase 1).                                                              |
| 5   | **No renderer tests.** `vitest.config.ts` is `environment: 'node'`, `include: ['tests/**/*.test.ts']`; no jsdom, no testing-library.                                                          | Decide whether this UI work is the moment to add them (see "Testing").                                        |
| 6   | **First-run gating currently lives in `App.tsx`** as inline text between setup sections. Once setup is a dialog, that gating has to be expressed as empty states + auto-opening the dialog.   | Phase 5.                                                                                                      |

---

## Phase 0 — Design tokens and stylesheet foundation `S`

The mockup is one flat token set; keep it that way rather than introducing a CSS framework or CSS-in-JS (repo has no styling deps today).

**Files**

- `src/renderer/src/styles/tokens.css` _(new)_ — `:root` (Midnight dark) and `:root[data-theme='light']` (Midnight light) blocks, copied verbatim from the mockup: `--page --bg --bg2 --bg3 --fg --dim --line --accent --accent-fg --accent-soft --ok --warn --err --shadow --thumb-shadow --font --mono`.
- `src/renderer/src/styles/app.css` _(new)_ — everything else from the mockup's stylesheet, in mockup order (`.topbar`, `.filterbar`, `.list`/`.row`, `.side`/`.status`, `.statusline`, dialog, appearance cards).
- `src/renderer/src/styles.css` — becomes two `@import`s plus the `body`/reset rules.

**Verify:** `npm run dev`, existing components render unstyled-but-tokenized; no visual target yet.

---

## Phase 1 — Theme setting, end to end `M`

Do this before the UI work: every later phase is easier to eyeball if both themes already switch.

**Main / data**

- `src/main/db/migrations.ts` — migration `id: 5, name: 'app_config_theme'`: `ALTER TABLE app_config ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`. Batch migration `id: 6, name: 'mods_first_seen_at'` into the same commit (see "Decisions" §4) so the schema churns once.
  - `app_config` is a single row created on first write (`saveRomConfig` upserts `id = 1`). `getAppConfig` already returns `EMPTY_CONFIG` when the row is absent — extend that constant with `theme: 'system'` so the no-row case stays coherent.
- `src/main/db/appConfig.ts` — add `theme: ThemeSource` to `AppConfig`/`AppConfigRow`/`rowToConfig`, plus `saveTheme(db, theme)` writing only that column (must not clobber ROM fields, and must insert the row if it doesn't exist yet).
- `src/main/ipc/config.ts` _(new)_ — `ConfigGet` / `ConfigSetTheme` handlers. `ConfigSetTheme` writes the DB **and** sets `nativeTheme.themeSource`, then returns the resolved value.
- `src/main/ipc/index.ts` — register it.
- `src/main/index.ts` — on startup, after `initDatabase()`, read the stored theme and apply `nativeTheme.themeSource` before `createWindow()` so the window doesn't flash the wrong background. Set `BrowserWindow` `backgroundColor` from the resolved theme for the same reason.
- **Title-bar overlay follows the theme** (decision 1 below). Keep the two resolved-theme color pairs in one place in main:

  ```ts
  // background = --bg2 (the top bar), symbol = --fg
  const OVERLAY = {
    dark: { color: '#151922', symbolColor: '#e6e8ee' },
    light: { color: '#f7f8fb', symbolColor: '#171a21' }
  }
  ```

  Apply at window creation and again on every theme change — both from `config:set-theme` and from `nativeTheme.on('updated')` (which fires when the OS theme flips while the preference is `'system'`) — via `win.setTitleBarOverlay(...)`. Guard the call: it throws where the overlay isn't supported.

**Shared / preload**

- `src/shared/ipc.ts` — `export type ThemeSource = 'system' | 'light' | 'dark'`; channels `ConfigGet: 'config:get'`, `ConfigSetTheme: 'config:set-theme'`; `AppSettings { theme: ThemeSource }`.
- `src/preload/index.ts` — `config: { get(), setTheme(theme) }`.

**Renderer**

- `src/renderer/src/theme/useTheme.ts` _(new)_ — loads the stored preference, resolves `'system'` through `window.matchMedia('(prefers-color-scheme: light)')` with a live `change` listener, writes `document.documentElement.dataset.theme`, exposes `{ pref, resolved, setPref }`.
  - Electron's `nativeTheme.themeSource` already drives what `prefers-color-scheme` reports in the renderer, so main and renderer agree without a second channel.

**Verify:** toggle in devtools console via `window.api.config.setTheme('light')`; restart the app and confirm it persists; set `themeSource: 'system'` and flip Windows' app theme with the app running.

---

## Phase 2 — App shell + settings dialog `L`

**Shell**

- `src/renderer/src/App.tsx` — rewritten to: `<TopBar>` (brand, search input, Refresh catalog, ⚙) · `<FilterChips>` · `<ModList>` · `<StatusLine>` · `<SettingsDialog>`. Owns the search string, active filter, and dialog open/pane state; mods and emulators stay in the components that fetch them (see phase 3).

**Top bar doubles as the window title bar** (decision 1)

- `src/main/index.ts` — `titleBarStyle: 'hidden'` plus the `titleBarOverlay` object from phase 1.
- `.topbar` becomes the draggable region: `-webkit-app-region: drag`, with `-webkit-app-region: no-drag` on every interactive child (search input, Refresh, ⚙). Miss one and it becomes an unclickable strip that drags the window instead.
- Reserve space for the window controls with the overlay's own CSS environment variables rather than a magic number, so the bar stays correct at different DPI and on macOS where the controls sit on the left:

  ```css
  .topbar {
    padding-left: env(titlebar-area-x, 18px);
    padding-right: calc(100% - env(titlebar-area-width, 100%) - env(titlebar-area-x, 0px) + 18px);
    height: env(titlebar-area-height, 46px);
  }
  ```

- **Platform spread matters here** — `electron-builder` targets NSIS, AppImage, and dmg. Windows and Linux get the colored overlay; macOS renders traffic lights over a hidden title bar and ignores the overlay colors, so it needs left-side inset instead (the `titlebar-area-x` variable above handles it). Verify on at least Windows before calling this done; treat the fallback values in that CSS as the "overlay unsupported" path.
- Keep `autoHideMenuBar: true`; with a hidden title bar there's no menu strip to reveal anyway.

**Dialog**

- `src/renderer/src/components/settings/SettingsDialog.tsx` _(new)_ — use the native `<dialog>` element with `showModal()`. It gives Esc-to-close, backdrop, focus trap, and focus restore for free, which the mockup's `div.scrim` fakes. Style `::backdrop` instead of `.scrim`.
- Panes, one file each under `components/settings/panes/`:
  - `AppearancePane.tsx` _(new)_ — the three preview cards from the mockup. Each card's preview is drawn from a hardcoded palette object so the light card looks light while dark is active. Radio semantics: `role="radiogroup"` + `role="radio"` `aria-checked`, arrow-key navigation.
  - `RomPane.tsx` — port of `RomSetup.tsx` into the field/hint markup: path input + Browse, verified pill, CRC hex, unverified-ROM confirm path.
  - `EmulatorsPane.tsx` — port of `EmulatorSetup.tsx`: `.emu-row` list, default pill, add/edit form, `{romPath}` hint, validation errors from `EmulatorSaveResult`.
  - `CatalogPane.tsx` _(new)_ — source (read-only until a second `ModCatalogSource` exists), Refresh now, cached count + last-refreshed.
  - `StoragePane.tsx` _(new)_ — patched-ROM output dir. Currently hardcoded in `src/main/ipc/catalog.ts` to `userData/roms` + `userData/patches`; this pane is **read-only + "Open folder"** unless a configurable output dir is in scope (needs another `app_config` column and plumbing through `installMod`). Recommend read-only for now.
  - `AboutPane.tsx` _(new)_ — version, stack line.
- Delete `RomSetup.tsx` / `EmulatorSetup.tsx` once ported (their logic moves wholesale; only markup changes).

**New IPC needed by the panes:** `shell:open-path` (Storage "Open folder", `shell.openPath`) and a `catalog:stats` or reuse of `CatalogRefreshResult` persisted somewhere for "last refreshed" — currently that timestamp is returned and thrown away. Simplest: store `catalog_refreshed_at` in `app_config` during `refreshCatalog` and return it from `config:get`.

**Verify:** every setup action that worked in the old inline UI still works from inside the dialog; Esc closes; focus returns to ⚙.

---

## Phase 3 — Library list `L`

- `src/renderer/src/components/ModList.tsx` _(new)_ — owns `mods`, refresh, install, play, and the existing 750 ms poll-while-downloading from `CatalogBrowser.tsx`. Applies filter + search + sort to produce visible rows.
- `src/renderer/src/components/ModRow.tsx` _(new)_ — thumbnail, title, meta line (`author · completionStatus`, **no size**), 2-line clamped description; error state swaps the description for `status.errorMessage` and adds `.is-error`.
- `src/renderer/src/components/ModRowActions.tsx` _(new)_ — the right rail, status label above action:
  - `ready` → Ready + **Play** + Folder/Remove. Play needs `patchedRomPath` + a default emulator; disable with a tooltip when there's no emulator rather than hiding.
  - `downloading` → Downloading + bar + `X / Y MB · N%` from `downloadProgressBytes`/`downloadTotalBytes` (reuse the math in `formatProgress`), + Cancel.
  - `error` → Error + Retry + "Open download page ↗" (existing `shell:open-external`, already https-restricted).
  - `not_downloaded` → Not installed + Download (disabled when `downloadLink` is null).
- `src/renderer/src/components/FilterChips.tsx` _(new)_ — All / Ready to play / Downloading / Not installed / Needs attention, counts computed against the search-filtered pool (matches the mockup: search and filter compose). Sort `<select>`: Name / Author / Status only (gap #3).
- `src/renderer/src/components/StatusLine.tsx` _(new)_ — `N of M mods`, ROM verified pill, default emulator name, last refresh.
- **New IPC this phase — all three row actions ship** (decision 4): `mod:reveal(modId)`, `mod:remove(modId)`, `mod:cancel(modId)`. Shapes in "Decisions" §2. The cancel path also changes `src/main/mods/install.ts` so an `AbortError` resolves to `not_downloaded` rather than the catch-all `error` status.
- **Downloads stay uncapped** (decision 3) — every `ModInstall` is independent, several rows can sit in `downloading` at once, and the `Map<modId, AbortController>` registry keys cancellation per mod. Revisit only if disk thrash or overlapping BPS applies become a real complaint; a "Queued" state is not being designed for now.
- **Pure logic goes in `src/renderer/src/lib/library.ts`** (filter/search/counts/sort/progress/`actionsFor`) so the components stay markup — see "Decisions" §3.
- Delete `CatalogBrowser.tsx`.

**Row count:** 41 mods × ~108 px. Plain rendering is fine at that size; revisit virtualization only if a source with hundreds of entries appears.

**Verify:** with a real catalog refresh, all four states render (force an error state with a `.7z`-linked mod — the catalog has them).

---

## Phase 4 — Thumbnails `M`

**What the source actually serves** — measured against the live site (20 mods sampled, 2026-08-04). `mod.json` carries `thumbnail_image` as a site-relative path (`/mods/<id>/screenshots/thumbnail.jpg`, occasionally a differently-named file). These are **full screenshots, not thumbnails**: 320×240 up to 1280×720, PNG and JPEG mixed, ~200 KB average and up to 555 KB, so roughly 8 MB across all 41 mods.

Aspect ratios: **12 of 18** parsed are 4:3 (the N64's native output), 5 are 16:9 (upscaled captures), 1 is portrait (`3rd_quest`, 528×704).

**Box: 4:3, 104×78, `object-fit: cover`, centered** (decision 2) — matches both the majority and the console's native ratio. The 16:9 minority loses ~17% off each side, which is survivable on a centered screenshot; the single portrait image is accepted collateral. The gradient-initials tile from the mockup stays as the fallback for missing, failed, or not-yet-cached images.

Two options for getting the bytes there:

**A. Widen the CSP** — `img-src 'self' data: https://hylianmodding.com` in `src/renderer/index.html`. One line. Cost: renderer hits the network directly, nothing renders offline, and the CSP is now source-specific (a second catalog source means editing the CSP again).

**B. Cache thumbnails in main (end state)** — on catalog refresh, background-fetch missing thumbnails into `userData/thumbs/<modId>.<ext>` with the existing concurrency cap (`src/main/catalog/concurrency.ts`) and the existing `downloadFile`; serve them through a registered `ocaris-thumb://` protocol handler; add only that scheme to `img-src`. Works offline, survives a source swap, no per-render network traffic.

Given the measurements above, **downscale on cache** rather than storing the originals: a 1280×720 PNG behind a 104×78 box is ~50× the pixels needed. `nativeImage.createFromPath(p).resize({ width: 312 })` (3× the box, enough for any DPI) then `.toJPEG(82)` cuts the cache to a fraction of 8 MB — and `nativeImage` ships with Electron, so this adds no dependency (no `sharp`, no native build in the packaging step).

Suggested: do **A** during phase 3 to unblock visual work, then **B** as its own commit before release.

---

## Phase 5 — First run, empty states, errors `M`

- First launch (no ROM): main view shows an empty state ("Add your ROM to browse mods") with a button that opens the dialog on the ROM pane; the dialog auto-opens once on first run. This replaces the `App.tsx` gating text from WP11.
- ROM set, no emulator: catalog is browsable and downloadable; only **Play** is disabled, with the reason in the status line. (Current behaviour hides the whole catalog — a regression worth fixing here.)
- Catalog empty (never refreshed): empty state with Refresh.
- Filter with zero matches: the mockup's "No mods match this filter."
- Errors currently rendered as `<p role="alert">` in `CatalogBrowser` (refresh failure, launch failure): move to a dismissible banner under the top bar. Per-mod install errors already live in the row.

---

## Phase 6 — Tests, docs, cleanup `M`

- **Main-process additions** get unit tests in the existing style: migration 5 (`tests/main/migrations.test.ts` — assert the column and the default), `saveTheme` round-trip and its don't-clobber-ROM-fields behaviour, and the thumbnail cache if phase 4B lands (against a local HTTP server, like the catalog tests).
- **Renderer tests** — `tests/renderer/library.test.ts` against the pure module from phase 3. No jsdom, no testing-library, no config change (see "Decisions" §3).
- **README** — the "Mod catalog UI" section describes `CatalogBrowser`, which this work deletes. Rewrite it around the library view + settings dialog, and add a short "Theming" note (token set, `data-theme`, `nativeTheme` wiring).
- **WORK_PACKAGES.md** — this spans WP11's remit; note it there.

---

## Suggested commit sequence

1. `tokens + stylesheet foundation` (phase 0)
2. `theme setting end-to-end, incl. title-bar overlay colors` (phase 1)
3. `integrated title bar + app shell` (phase 2, window chrome half)
4. `settings dialog + panes, setup moved out of the main view` (phase 2, dialog half)
5. `mod row actions: reveal, remove, cancel` (phase 3, main-process half — new IPC + the `installMod` abort change, independently testable)
6. `library list with per-state row actions` (phase 3, renderer half, CSP option A)
7. `first-run + empty states + error banner` (phase 5)
8. `thumbnail cache + downscale + protocol handler` (phase 4B)
9. `tests + README` (phase 6)

Steps 4 and 6 are each large enough to land broken-in-between if done in one commit. Step 5 before 6 means the renderer half has real IPC to call instead of stubs. Step 3 is separable — if the title-bar integration turns out to fight a platform, it can be reverted on its own without touching the rest.

---

## Decisions on the open items

### 1. Storage pane — keep it read-only, but stop hardcoding the path

`src/main/ipc/catalog.ts` inlines `join(app.getPath('userData'), 'roms')` and `.../patches` in the `ModInstall` handler.

**Recommendation: read-only pane + "Open folder" now.** Patched ROMs are derived artifacts — regenerable from ROM + patch — so a custom location buys little for the risk of a user pointing it at a removable drive that's gone next launch.

The real counter-argument is size: a patched OoT ROM is 32–64 MB, so a full library is on the order of a gigabyte or two sitting on the system drive. That's a legitimate reason someone wants it elsewhere, just not a v1 reason.

Cheap hedge, do it in phase 3: move path resolution into one function in main —

```ts
// src/main/storage/paths.ts
export function getPatchedRomDir(db: Database.Database): string
export function getPatchCacheDir(db: Database.Database): string
```

— reading `app_config` with a `userData` fallback. Making it configurable later is then a migration plus a pane field, not a hunt through call sites. Pair it with **Remove** (below) so there's an in-app way to reclaim the space.

### 2. Folder / Remove / Cancel — all three ship in phase 3

**Folder — ship it.** New `mod:reveal` channel calling `shell.showItemInFolder`. Take a **`modId`, not a path**: the renderer shouldn't hand main an arbitrary filesystem path to open, and main already has `patchedRomPath` in `mod_status`. Same shape as the existing `shell:open-external` https restriction.

**Remove — ship it.** Without it the only way to reclaim disk is deleting from `userData` by hand, which is worse than the feature costs. `mod:remove(modId)` → unlink `patchedRomPath` and the cached patch file, reset `mod_status` to `not_downloaded` (clear `patchedRomPath`, `errorMessage`, progress). Missing files are not an error — a user may have deleted them already, so unlink failures with `ENOENT` are ignored and the status reset still happens.
Confirmation: inline in the row (`Remove` swaps the rail to `Remove patched ROM? [Cancel] [Remove]`) rather than a modal. Destructive but cheaply undone by re-downloading.

**Cancel — ship it** (decision 4). A 30 MB download with no way out is the worst of the four row states, and the `installMod` change is better made while that file is fresh. Three pieces:

1. A `Map<string, AbortController>` in the catalog IPC module, keyed by `modId`, populated by `ModInstall` and cleared in a `finally`.
2. `mod:cancel(modId)` → `controller.abort()`. `downloadFile` already handles `AbortSignal` and guarantees no file is left at the destination, so nothing leaks.
3. **`src/main/mods/install.ts` currently funnels every failure into an `error` status.** An abort is user-initiated, not a failure — it must land on `not_downloaded` with no error message, or the row shows a red "Error" state for something the user did on purpose. That's a real change to `installMod`, not just new plumbing.

No resume — cancel means "start over", which is fine for 5–30 MB patches.

### 3. Renderer tests — extract the logic, skip the DOM infra

**Recommendation: neither of the options as originally framed.** The parts worth testing are pure, so they don't need jsdom at all:

```
src/renderer/src/lib/library.ts
  filterMods(mods, { filter, query })
  countsByFilter(mods, query)      // chip counts, must compose with search
  sortMods(mods, sort)
  formatProgress(status)           // the byte math already in CatalogBrowser
  actionsFor(mod, { hasEmulator }) // state -> which buttons, which disabled
```

`actionsFor` returning a descriptor the component maps to buttons is the important one — it makes "which of the four states shows what" testable without rendering anything.

Tests go in `tests/renderer/library.test.ts`. The existing vitest config already matches (`tests/**/*.test.ts`), the `@shared` alias already resolves, and these modules import only types from `@shared/ipc` — so **zero new dependencies and zero config changes**. Adding jsdom + `@testing-library/react` + a second vitest project for what would be a handful of shallow render assertions isn't worth it yet; revisit if the dialog's focus/pane behaviour starts breaking.

### 4. `first_seen_at` — add it, in the same migration batch as the theme column

Small, and "what's new since I last looked" is a real browsing need for a catalog that grows.

```sql
ALTER TABLE mods ADD COLUMN first_seen_at INTEGER;
UPDATE mods SET first_seen_at = fetched_at WHERE first_seen_at IS NULL;
```

`upsertMods` sets it in the `INSERT` column list and simply omits it from the `ON CONFLICT DO UPDATE SET` clause (which today rewrites `fetched_at` on every refresh — that's why it can't serve as an "added" timestamp).

Batch it as migration 6 alongside the theme column so the schema churns once. Note the sort is near-useless for the first refresh cycle, since every existing row gets the same backfilled timestamp — it becomes meaningful from the next new mod onward. Once the column exists, a "New" badge on rows first seen since the previous launch is nearly free.

---

## Design decisions taken (2026-08-04)

1. **Window chrome — integrated title bar.** `titleBarStyle: 'hidden'` + `titleBarOverlay`; the app's own top bar _is_ the title bar. Chosen over the safer stacked-bars option for a single unified bar. Cost, planned into phases 1–2: overlay colors must be re-applied on every theme change (including OS-driven ones while the preference is `'system'`), drag regions have to be right on the first try or the bar becomes unclickable, and macOS needs the traffic-light inset instead of a colored overlay. Verify per platform — this is the item most likely to need a second pass.
2. **Thumbnails — keep the mockup's 4:3 104×78 `cover` box.** Backed by measurement (see phase 4): 12 of 18 sampled images are 4:3, matching the N64's native output.
3. **Concurrent downloads — uncapped.** No queue, no "Queued" state; several rows may sit in `downloading` at once and the Downloading filter is where that's visible. Revisit only on a real complaint.
4. **Cancel — ships in the first pass**, together with Folder and Remove, including the `installMod` change that makes an abort resolve to `not_downloaded` instead of `error`.

### Settled by default, flagged so they're not accidents

- **Search matches name + author only**, not descriptions — description matches would fire on text the row visually clamps to two lines, which reads as a false positive.
- **Filter/sort/search are not persisted** across restarts; the app always opens on All / Name (A–Z).
- **Progress stays on the existing 750 ms `catalog:list` poll** rather than a pushed `mod:progress` event. It already works and is already tested; stable React keys mean thumbnails won't re-request on each tick. Revisit if several simultaneous downloads make the re-fetch of all rows feel heavy.
- **Mod descriptions are third-party text and stay text** — React escapes them. Nothing in this UI may reach for `dangerouslySetInnerHTML`, even if descriptions turn out to contain markup.
