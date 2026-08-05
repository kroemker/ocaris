# Catalog Source Spec — hylianmodding.com (WP5)

Investigated by fetching the live site through this environment's outbound proxy (`curl`, plus a static read of the compiled JS bundle to find the `fetch()` call sites — headless-Chromium DevTools-style inspection hit an unrelated local TLS-trust issue for the proxied Chromium instance, but the bundle read achieves the same goal: it shows the exact fetch calls in source, not just what fires during one page load).

## tl;dr

`hylianmodding.com/mods` is **not backed by a bespoke API**. It's a Vite-built SPA that fetches static, same-origin JSON files. That's simpler and more stable than reverse-engineering a REST API, but the catalog data itself has more format variance than the brief anticipated — see "Complications" below before starting WP6.

## Endpoints

All same-origin, `GET`, no auth, no pagination, plain JSON:

| Purpose                            | URL pattern                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Mod ID list                        | `GET /mods/index.json` → `{"mods": ["id1", "id2", ...]}`                        |
| Mod detail                         | `GET /mods/<id>/mod.json`                                                       |
| Tool ID list (out of scope)        | `GET /tools/index.json` (same shape, different category)                        |
| Competition entries (out of scope) | `GET /competitions/<comp>/index.json`, `GET /competitions/<comp>/<id>/mod.json` |

`/mods/index.json` currently lists **~140 entries** (sampled; not exhaustively counted). No `robots.txt` exists and no terms-of-service/privacy page is defined in the app's routes (confirmed by grepping the bundle for "Terms of"/"privacy" - nothing found, and `/terms`, `/privacy`, `/tos`, `/legal` all just fall through to the SPA shell). No explicit usage policy to violate or honor beyond ordinary courtesy (identify our client, don't hammer it, cache locally rather than re-fetching per mod - which was already the plan per the brief).

## `mod.json` schema (observed, not documented anywhere)

```json
{
  "name": "Zelda 64: Dawn and Dusk",
  "id": "zelda64_dawn_and_dusk",
  "authors": ["Captain Seedy-Eye", "LuigiBlood", "PK-LOVE", "BWXIX"],
  "description": "...",
  "category": "mod",
  "supported_games": "OoT",
  "completion_status": "complete",
  "thumbnail_image": "/mods/<id>/screenshots/thumbnail.jpg",
  "screenshots": ["/mods/<id>/screenshots/screenshot_0.jpg", "..."],
  "download_link": "/mods/<id>/downloads/<file>",
  "last_updated": "2023-10-14",
  "timestamp": "1697285062857",
  "is_update": false,
  "changelog": []
}
```

- `supported_games` values seen: `"OoT"`, `"MM"` (Majora's Mask). **Filter to `"OoT"`** - this catalog covers more than one game.
- `completion_status` casing is inconsistent across entries (`"complete"`, `"Complete"`, `"Demo"`) - compare case-insensitively if used at all.
- `download_link` is sometimes root-relative with a leading slash, sometimes without (`"mods/star_fox_64_survival/..."`) - always resolve against the site origin rather than assuming a leading `/`.
- **`thumbnail_image`'s extension and the server's `Content-Type` both lie about the format.** 15 of the 41 OoT thumbnails are WebP; 10 of those are served as `thumbnail.png`/`.jpg` with a matching `image/png`/`image/jpeg` header. Only the magic bytes are truthful. This matters because Electron's `nativeImage` decodes PNG and JPEG only - it returns an *empty* image for WebP rather than throwing, so a naive decode-and-resize silently drops a third of the catalog's thumbnails (see `src/main/thumbnails/cache.ts`).

## Complications for WP6/WP8/WP9 (found by actually downloading samples, not just reading `mod.json`)

**1. `download_link` isn't reliably a direct patch file.** Sampled 14 mods' `download_link` extensions: `.zip` (majority), `.7z` (at least one), bare `.bps` (several), and outright links to a **GitHub Releases page** (`https://github.com/.../releases`) for at least two mods - not a file at all, just an HTML page a human has to click through.

**2. Zips can contain multiple `.bps` files for different ROM versions/regions, with no structured metadata saying which is which.** Downloaded `zelda64_dawn_and_dusk`'s zip and got six patches: `DawnDusk_v2_{J,U}_{1.0,1.1,1.2}.bps`. The filenames happen to encode region/version here, but that's a per-author convention, not something `mod.json` declares - can't rely on parsing filenames in general.

**Recommended handling:** don't parse filenames at all. BPS patches embed their own expected source CRC32 (this is exactly what `src/patch/bps.ts`'s `BpsSourceMismatchError` already checks). Given a zip with N `.bps` files, try each against the user's verified ROM and use whichever one's source CRC matches. Zero filename-parsing, and it's _more_ correct than trusting naming conventions - directly reuses WP3 as-built.

**3. Archive format needs handling, not just "download the file."** `.zip` is very common and there's no built-in Node support for it (need a dependency - `adm-zip` or `yauzl`). `.7z` shows up too and has no good pure-JS story in Node. Given the sample size, treating `.7z` and external-link (GitHub Releases, etc.) mods as **"browse only, download manually"** rather than blocking WP6 on building a 7-Zip extractor or a GitHub-releases-asset resolver is the pragmatic call - full automation for those is a bigger, separate piece of work if it turns out to matter for enough of the catalog.

## Recommendation for WP6

Build `HylianModdingCatalogSource implements ModCatalogSource`:

1. `fetchCatalog()`: `GET /mods/index.json`, then `GET /mods/<id>/mod.json` for each id (or lazily, on demand - ~140 requests up front is a lot for one refresh; consider fetching details lazily per-mod and caching, or batching with concurrency limits).
2. Filter to `supported_games === "OoT"`.
3. Normalize into `ModRecord` (already defined in `src/main/db/mods.ts`): `name`, `author` (join `authors`), `description`, and stash `{ downloadLink, thumbnailUrl, screenshots, completionStatus }` in `metadata` (already a free-form JSON column for exactly this).
4. Classify `download_link` by extension/host at install time (WP8/WP9's job, not the catalog fetch): same-origin `.bps` → download directly; same-origin `.zip` → download, extract, CRC-match; anything else (`.7z`, external host) → mark as "manual download" and surface the link in the UI instead of an automatic install button.

This is a bigger lift than the original WP8/WP9 (which assumed "the download link is a patch file") accounted for - flagging that explicitly rather than quietly narrowing scope.
