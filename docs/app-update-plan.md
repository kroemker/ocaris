# Plan — in-app self-update

How Ocaris would update itself, in the order the pieces have to land. Scoped to the app updating its own binary; updating *mods* when a catalog offers a newer patch is a separate feature (see [ideas.md](./ideas.md)).

The mechanism is `electron-updater` (the runtime half of `electron-builder`, already a devDependency here) reading a feed from GitHub Releases. Nothing about it works until Ocaris actually publishes releases, which is why the pipeline comes first.

## What has to be true before any of this runs

The app has never been released: `package.json` says `0.0.1`, there are no git tags, no `publish` block, and no CI. `electron-updater` does not "check GitHub for a newer tag" - it fetches a generated manifest (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) that `electron-builder --publish` uploads next to the installers. No manifest, no updates.

Three platform truths that decide how much of this is worth building:

- **Windows (nsis)** — works unsigned. Every unsigned build triggers a SmartScreen warning on first run, and that reputation does not accumulate without a code-signing certificate, but the update itself downloads and installs. The default `oneClick` per-user install needs no elevation, so updates are silent.
- **Linux (AppImage)** — works unsigned, but only when the app is actually running *as* an AppImage. A build run out of `release/linux-unpacked/` never updates, which matters because that is exactly how this project has been smoke-testing so far.
- **macOS (dmg)** — **does not work as configured**, for two independent reasons. Squirrel.Mac refuses to apply an update that is not signed with a Developer ID certificate (Apple Developer Program, $99/yr) and notarized; and the feed for macOS is built from a `zip` artifact, so `target: ['dmg']` alone produces no updatable payload. Both are fixable, but the signing half costs money and an Apple account, so macOS self-update should be treated as an explicitly deferred stage rather than something the first version pretends to support.

## WP-U1 — Publishing pipeline — **done**

Answered while implementing it: `kroemker/ocaris` is **public**, so an updater can fetch release assets without a token and self-update is viable. The repo's default branch on GitHub is `dev`, with `main` also present - which branch a release is cut from is a decision WP-U4 needs.

Landed: the `publish` block (draft releases), `zip` alongside `dmg` for macOS, and `npm run release`. Verified by building the Windows installer locally: electron-builder wrote `release/latest.yml` with the version, size and sha512 the updater checks a download against. The version bump itself is deliberately not done yet - `npm version minor` does it at release time, so `package.json` and the tag cannot drift.

<details>
<summary>Original scope</summary>


**Goal:** A tagged version of Ocaris exists as a GitHub release, with installers and update manifests attached, produced by one command.

**Scope:**

- `publish` block in `package.json`'s `build`: `{ provider: 'github', owner: 'kroemker', repo: 'ocaris' }`. Confirm the repository is **public** first - a private repo's release assets need a token to download, and an app cannot ship one, which would kill self-update outright.
- Add `zip` to the macOS targets alongside `dmg` (needed for the mac feed later; harmless now).
- Version scheme: move off `0.0.1` to a real `0.1.0`, tags as `v0.1.0`, and treat `package.json`'s version as the single source - `electron-builder` derives the manifest from it.
- A `release` script (`electron-vite build && electron-builder --publish always`) plus a note on `GH_TOKEN`.

**Depends on:** nothing.

**Acceptance criteria:**

- A draft GitHub release for a tag carries, per platform, the installer plus its `latest*.yml`, and the `.yml` version matches `package.json`.
- Downloading and installing that artifact by hand produces a working Ocaris (this is also the last checkpoint where a broken build can be caught before an updater starts distributing it).

**Notes:** `npmRebuild: false` exists because this environment cannot download Electron headers. CI *can*, so the release job may want it re-enabled per-platform - but `better-sqlite3` already resolves an Electron-aware prebuilt, so change it only if a native module fails, and re-run the packaged smoke test if you do.

</details>

## WP-U2 — Updater in the main process

**Goal:** The main process can check, download and install an update, and reports every state transition to the renderer.

**Scope:**

- `electron-updater` as a **runtime** dependency (`dependencies`, not `devDependencies`) - it is required at runtime from the packaged app.
- `src/main/update/updater.ts`: wraps `autoUpdater` with `autoDownload = false` (the user consents to a download; a background download on a metered connection is not a decision to make for them) and `autoInstallOnAppQuit = true`.
- A single state machine surfaced to the renderer rather than raw electron-updater events: `idle | checking | available | downloading | ready | error | unsupported`, plus version and download progress. `unsupported` covers the honest cases - a dev run (`!app.isPackaged`), and macOS until WP-U5.
- IPC: `update:check`, `update:download`, `update:install` (quit and install now), and a pushed `update:status` event. The push follows the `mod:progress` precedent, including reusing `throttleProgress` for download percentages.
- Check once on launch, after the window is up and idling (not during startup, which already opens the DB, applies migrations and paints), and on demand from the UI. No polling loop.
- Errors resolve to an `error` status, never an unhandled rejection: a machine offline at launch must not produce a dialog, and `checkForUpdates()` rejects on any network failure.

**Depends on:** WP-U1 (there is nothing to check against otherwise).

**Acceptance criteria:**

- Unit tests around the state mapping and the "dev build reports `unsupported`" guard, with `autoUpdater` faked - no network in tests, matching how the catalog sources are tested.
- A packaged build one version behind the published release reaches `ready` and installs on quit.

## WP-U3 — Renderer surface

**Goal:** The user can see their version, ask for an update, and apply one, without hunting.

**Scope:**

- Settings → About pane grows an update section: current version, a "Check for updates" button, and the state machine rendered inline (checking / up to date / version X available with a Download button / progress bar / "Restart to update").
- One banner under the top bar when an update is `ready`, reusing the existing banner component, with "Restart now" and a dismiss. Only for `ready` - `available` and `downloading` stay in Settings, because an update is not urgent enough to interrupt the library.
- Release notes: `autoUpdater` exposes them from the GitHub release body. Show them in the About pane, plain text, no HTML rendering.

**Depends on:** WP-U2.

**Acceptance criteria:**

- Every state has a defined rendering, including `unsupported` (which says why - "updates are handled by your package manager / not available in a dev build" - rather than showing a dead button).
- The status logic lives in a pure module under `src/renderer/src/lib/` and is unit-tested there, like `library.ts`.

## WP-U4 — Release automation

**Goal:** Pushing a tag produces the release; no one builds installers by hand on three machines.

**Scope:**

- `.github/workflows/release.yml`: matrix over `windows-latest`, `macos-latest`, `ubuntu-latest`, triggered on `v*` tags, running `electron-builder --publish always` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- A CI workflow for the existing `lint`/`typecheck`/`test` on pull requests, which the repo also does not have yet and which matters more once releases are automatic.

**Depends on:** WP-U1.

**Acceptance criteria:** A tag push yields a draft release with all three platforms' artifacts; publishing that release makes an older installed build offer the update.

## WP-U5 — macOS (deferred, costs money)

**Goal:** macOS updates instead of silently reporting `unsupported`.

**Scope:** Apple Developer Program membership, Developer ID Application certificate in CI secrets, `notarize` in the build config, hardened runtime entitlements, and the `zip` target from WP-U1 doing its job.

**Notes:** Nothing else in the plan blocks on this, and the honest `unsupported` state from WP-U2 means macOS users are told to download a new build rather than being left with a button that fails.

## Testing

The part that usually goes wrong, so it gets a section rather than a bullet:

- `autoUpdater` no-ops in dev. A first smoke test is possible with a `dev-app-update.yml` and `forceDevUpdateConfig`, but it proves the wiring, not the install.
- The real test is: publish `0.1.0`, install it, publish `0.1.1`, launch the installed `0.1.0`, and watch it update. Do this per platform; Windows NSIS and Linux AppImage have genuinely different install mechanics.
- Test the downgrade-free path too: an app already on the newest version must land in `idle`/"up to date", not in an error.

## Suggested order

```
WP-U1 ── WP-U2 ── WP-U3
   └───── WP-U4          WP-U5 (whenever macOS matters)
```

WP-U1 first and alone: it is the only package that can invalidate the rest (a private repository, or a macOS decision, changes what U2 and U3 should even claim).
