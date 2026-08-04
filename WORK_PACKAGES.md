# Ocaris — Work Packages

Derived from the [Project Brief](#) discussion. Each package is scoped to be implementable and reviewable as a standalone unit. Suggested implementation order follows the numbering, but dependencies are called out explicitly so packages can be re-sequenced if needed.

Legend: **Depends on** lists hard prerequisites. **Acceptance criteria** are the bar for calling a package done and ready for review.

---

## WP0 — Project Scaffolding

**Goal:** A running Electron + React + TypeScript shell with the project's baseline tooling, so every later package has somewhere to land.

**Scope:**
- Electron main/renderer/preload process split, with context isolation and a typed IPC bridge (no `nodeIntegration` in renderer).
- React + TypeScript in the renderer, with a bundler (Vite recommended for Electron+React+TS).
- Lint/format/test tooling (ESLint, Prettier, a test runner — Vitest or Jest).
- `better-sqlite3` wired up with a migrations mechanism (even a minimal hand-rolled one) and a DB file location under the OS-appropriate app data directory.
- Basic app window boots to an empty "Ocaris" shell.

**Depends on:** nothing.

**Acceptance criteria:**
- `npm run dev` launches the app in dev mode; `npm run build` produces a packaged-able build.
- IPC round-trip demo (renderer → main → renderer) works through the typed bridge.
- SQLite DB file is created on first launch in the correct app-data path.
- CI-able: lint + typecheck + test script all pass from a clean checkout.

**Notes:** This is infrastructure, not features — keep it minimal. Don't build the final DB schema here (that's WP4); just prove the plumbing works.

---

## WP1 — ROM Verification

**Goal:** Let the user select their OoT 1.0 (U) ROM and verify it's the expected file.

**Scope:**
- File picker for ROM selection (native Electron dialog).
- Hash computation (CRC32 and/or SHA-1) of the selected file.
- Comparison against the known-good OoT 1.0 (U) hash constant(s).
- Clear UI state for match / mismatch, with an explicit warn-and-allow-override path for mismatches (don't hard-block — some users may have legitimately different but compatible dumps; the point is informed consent, not DRM).
- Persist the verified ROM path (not the ROM itself) to local config/SQLite.

**Depends on:** WP0 (app shell, DB).

**Acceptance criteria:**
- Selecting a known-good ROM shows a verified state and stores its path.
- Selecting a wrong file shows a mismatch warning with hash details, and requires explicit confirmation to proceed.
- ROM path persists across app restarts.
- Unit tests for the hash-compute + compare logic using a small fixture (not the real copyrighted ROM — a synthetic byte buffer with a known hash is enough).

**Notes:** Never copy or embed the ROM itself into the repo or into any test fixtures.

---

## WP2 — Emulator Configuration

**Goal:** Let the user register one or more N64 emulators (executable path + optional launch args) that Ocaris can later invoke.

**Scope:**
- UI to add/edit/remove emulator configs: display name, executable path (native file picker), optional argument template (e.g. supporting a `{romPath}` placeholder).
- Validation that the executable path exists and is executable.
- Persist configs to SQLite.
- Support marking one emulator as "default" when multiple are configured.

**Depends on:** WP0.

**Acceptance criteria:**
- Can add, edit, delete emulator entries; changes persist across restarts.
- Invalid/missing executable paths are flagged in the UI before save.
- Config data model supports the argument-template substitution needed later by WP10 (Launch), even though launching itself isn't implemented here.

**Notes:** This package and WP1 are both "fully self-contained, no external dependencies" per the brief and can be built in parallel by different people/sessions if desired.

---

## WP3 — BPS Patch Engine

**Goal:** A well-isolated, well-tested module that applies a `.bps` patch to a source ROM buffer and produces the patched output, without ever touching the original file.

**Scope:**
- BPS format parser/applier (implement from spec, or wrap an existing well-vetted library — evaluate both and document the choice).
- Pure function/module boundary: `applyBpsPatch(sourceBuffer, patchBuffer) -> patchedBuffer`, with no filesystem side effects inside the core logic (I/O happens at the call site).
- Checksum verification where the BPS format provides one (BPS patches embed CRC32 of source, target, and patch itself) — verify and surface clear errors on mismatch.
- Unit tests against known-good sample patches (use small synthetic binary fixtures, not copyrighted ROM data, to keep the repo clean).

**Depends on:** WP0.

**Acceptance criteria:**
- Applying a valid patch to its expected source produces byte-identical output to a known-good target fixture.
- Applying a patch to the wrong source is detected and rejected via the embedded source-CRC check, with a descriptive error.
- Corrupt/truncated patch files fail gracefully with a descriptive error, not a crash.
- Module has no dependency on Electron APIs — it should be usable/testable as plain Node/TS.

**Notes:** Brief flags this as "the core value-add piece" — prioritize correctness and test coverage over speed of delivery. If `.xdelta` support is deferred, say so explicitly in the module's README/interface rather than silently.

---

## WP4 — Local Data Layer (SQLite Schema)

**Goal:** Finalize the SQLite schema and a typed data-access layer for everything that needs to persist: catalog cache, download/patch status, user config.

**Scope:**
- Schema design: `mods` (catalog cache), `mod_status` (not-downloaded / downloading / ready, patched ROM path, timestamps), `emulators`, `app_config` (ROM path, hash, catalog source setting, last-refresh timestamp).
- Migration mechanism (versioned, applied on startup).
- Typed repository/DAO functions used by the rest of the app (no raw SQL scattered through UI code).

**Depends on:** WP0. Informed by the shapes needed in WP1/WP2 (may land those packages' persistence into this schema retroactively, or do this package first and have WP1/WP2 build on it — pick one ordering and note the choice).

**Acceptance criteria:**
- Schema covers all entities named in the brief's core flow.
- Migrations apply cleanly on a fresh DB and are idempotent on an already-migrated DB.
- DAO layer has unit tests covering CRUD for each entity.

**Notes:** This is a good point to decide the WP1/WP2-vs-WP4 ordering question above — recommend doing a minimal version of this schema early (fold into WP0) and iterating, rather than blocking WP1/WP2 on a "final" schema.

---

## WP5 — Catalog Source Investigation Spike

**Goal:** Resolve the open design question — determine the concrete shape of the primary catalog source before writing adapter code.

**Scope:**
- Inspect `hylianmodding.com/mods` via browser DevTools (Network tab, XHR/Fetch filter) to find the underlying API call(s).
- Document: endpoint URL(s), HTTP method, query params/pagination, auth (if any), full JSON response schema, and how per-mod detail (description, author, download link, patch file format) maps to fields.
- Check the site's terms of service / robots.txt for any stated restrictions on programmatic access.
- If the primary candidate turns out to be unworkable (no stable API, ToS blocks it, structure too unstable), fall back to investigating `zelda-64-mods.fandom.com`'s MediaWiki `action=query` API instead, and document *that* schema.
- Deliverable is a written spec (markdown doc), not production code.

**Depends on:** nothing technically, but should happen before WP6. Can run in parallel with WP1–WP4.

**Acceptance criteria:**
- A markdown doc exists (e.g. `docs/catalog-source-spec.md`) with concrete example requests/responses for the chosen source.
- Explicit go/no-go recommendation on which source to implement first, with reasoning.
- Any ToS/attribution/distribution constraints discovered are called out for WP6 and WP8 to respect.

**Notes:** This directly unblocks the brief's stated first implementation task. Treat it as research, not implementation — no adapter code yet.

---

## WP6 — Catalog Source Adapter

**Goal:** A pluggable `ModCatalogSource` interface, plus one concrete implementation for the source chosen in WP5, with local caching.

**Scope:**
- Define the `ModCatalogSource` interface (e.g. `fetchCatalog(): Promise<ModEntry[]>`, `fetchModDetail(id): Promise<ModDetail>`), independent of any specific backing source.
- Implement the concrete adapter (hylianmodding.com API client, or MediaWiki `action=query` client per WP5's recommendation).
- Map source-specific data into the app's normalized `ModEntry`/`ModDetail` shape.
- Cache fetched results into the WP4 SQLite schema; support manual refresh and a scheduled/staleness-based refresh policy.
- Error handling for source unavailability (network errors, schema drift) — app should degrade to showing cached data with a "stale/unreachable" indicator, not crash.

**Depends on:** WP4 (data layer), WP5 (source spec).

**Acceptance criteria:**
- Adapter implements the interface and is swappable via config/DI — demonstrate this by writing a second trivial fake adapter used in tests.
- Fetched catalog data is correctly cached and re-served from SQLite without re-hitting the network on every app open.
- Manual refresh button/action updates the cache and timestamp.
- Integration test (can be recorded/mocked HTTP fixtures rather than live network) covers the happy path and a malformed-response path.

**Notes:** Keep the interface source-agnostic enough that adding the MediaWiki fallback later (if hylianmodding.com changes) doesn't require touching consumer code.

---

## WP7 — Mod Catalog UI

**Goal:** Browse the cached catalog in the app.

**Scope:**
- List view of mods: name, author, description, current state (Not downloaded / Downloading / Ready to play).
- Search/filter (at minimum by name; author/tag filtering if the catalog data supports it).
- Manual refresh control, with loading/error/stale states surfaced from WP6.
- Detail view/panel for a single mod.

**Depends on:** WP6.

**Acceptance criteria:**
- List renders from real cached catalog data (via WP6 adapter) end-to-end.
- State badges correctly reflect `mod_status` from the DB.
- Refresh action visibly updates the list and shows loading/error states appropriately.

---

## WP8 — Download Manager

**Goal:** Fetch a mod's patch file from its source-provided URL and store it locally, respecting distribution terms.

**Scope:**
- Given a `ModEntry`/`ModDetail`, resolve and download the patch file (`.bps`, possibly `.xdelta`) to a local cache directory.
- Progress reporting (bytes downloaded / total) surfaced to the UI via IPC.
- Respect distribution constraints identified in WP5 (e.g. if a source's terms disallow mirroring patch files beyond ephemeral use, honor that instead of permanently caching).
- Retry/error handling for failed downloads; cancel-in-progress support.
- Update `mod_status` in SQLite as downloads progress/complete/fail.

**Depends on:** WP4, WP6 (or at least WP6's data shapes/interface even if using a stub adapter).

**Acceptance criteria:**
- Downloading a mod's patch file updates state through Not downloaded → Downloading (with live progress) → Downloaded, persisted correctly.
- A failed/cancelled download leaves state consistent (no orphaned partial files silently treated as complete).
- Distribution-terms handling from WP5 is implemented, not just noted.

---

## WP9 — Patch Pipeline (Download → Patch → Ready)

**Goal:** Wire the download manager and BPS patch engine together against the verified base ROM to produce a playable patched ROM, end-to-end.

**Scope:**
- On patch-file-downloaded, copy the verified base ROM (never touch the original), apply the patch via WP3's engine, and write the patched ROM to a per-mod location.
- Update `mod_status` to "Ready to play" on success, store the patched ROM path.
- Surface patch-apply errors (e.g. BPS source-checksum mismatch against the user's ROM) clearly in the UI, distinguishing "your ROM doesn't match what this patch expects" from generic failures.

**Depends on:** WP1 (verified ROM path), WP3 (patch engine), WP8 (downloaded patch file).

**Acceptance criteria:**
- For a real test mod, the full chain (download → copy ROM → patch → mark ready) runs without manual intervention and produces a correct patched ROM.
- Original base ROM file is provably untouched (checksum before/after matches).
- A deliberately mismatched patch/ROM pair produces a clear, non-crashing error surfaced to the user.

---

## WP10 — Launch / Play

**Goal:** Launch the configured emulator with a patched ROM.

**Scope:**
- "Play" action on a "Ready to play" mod, using the default (or user-selected) emulator config from WP2.
- Spawn the emulator via `child_process.spawn`, substituting the patched ROM path into the emulator's argument template.
- Handle spawn errors (bad executable path, permission errors) with a clear UI message.
- Decide and implement whether Ocaris waits/tracks the emulator process (e.g. to show "Running" state) or fire-and-forgets.

**Depends on:** WP2 (emulator config), WP9 (patched ROM available).

**Acceptance criteria:**
- Clicking Play on a ready mod launches the configured emulator with the correct ROM path argument.
- Multiple configured emulators can be chosen from if more than one exists.
- Spawn failures are caught and surfaced, not left as unhandled promise rejections/silent failures.

---

## WP11 — UX Polish (Library, Progress, Errors)

**Goal:** Bring the end-to-end flow from "functional" to "usable" once WP1–WP10 are all wired together.

**Scope:**
- Consolidated library view distinguishing "installed/ready" mods from the full catalog browse view.
- Consistent download/patch progress indicators across the app.
- Consistent error/toast/notification patterns for the failure cases introduced in earlier packages (hash mismatch, download failure, patch failure, spawn failure).
- Empty states (no ROM configured yet, no emulator configured yet, empty catalog) with guidance pointing back to first-run setup.
- First-run onboarding flow that sequences WP1 → WP2 before letting the user reach the catalog.

**Depends on:** WP1–WP10 substantially complete.

**Acceptance criteria:**
- A first-time user can go from a fresh install to a playing a mod using only in-app guidance, no external docs.
- All error states defined in earlier packages have a corresponding UI treatment (not just console logs).

---

## WP12 — Packaging & Distribution

**Goal:** Produce installable builds of Ocaris for at least the developer's primary OS (expand to others as needed).

**Scope:**
- `electron-builder` (or equivalent) configuration for packaging.
- App icon, metadata, versioning.
- Verify the packaged app correctly locates its SQLite DB and cache directories (not just in dev mode).

**Depends on:** WP0 core, practically scheduled after WP11 but technically only needs a buildable app.

**Acceptance criteria:**
- A packaged build installs and runs on a clean machine/VM, with the full flow (WP1–WP10) working from that packaged build, not just `npm run dev`.

---

## Suggested sequencing

```
WP0 ─┬─ WP1 ─┐
     ├─ WP2 ─┤
     ├─ WP3 ─┤
     ├─ WP4 ─┼─ WP9 ── WP10 ─┐
     └─ WP5 ─ WP6 ─ WP7      ├─ WP11 ─ WP12
                    WP8 ──────┘
```

WP1, WP2, WP3, and WP4 can proceed in parallel after WP0. WP5 can also start immediately (it's research, not code) and should be prioritized early since it's the brief's explicit "first implementation task" and unblocks WP6 onward. WP9 is the integration point requiring WP1, WP3, and WP8 all done.

## Review process

Each WP should land as its own PR (or small stack of PRs for larger ones like WP6/WP9), reviewed against that package's acceptance criteria before moving to the next. Packages marked "no external dependencies" (WP1, WP2, WP3) are good candidates to parallelize or to tackle first for early momentum, per the brief's suggested build order.
