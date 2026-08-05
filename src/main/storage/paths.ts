import { app } from 'electron'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

/**
 * Single source of truth for where downloaded patches and patched ROMs live.
 *
 * Both take the database even though neither reads it yet: the locations are
 * fixed under userData for now, and making them configurable should be a
 * change here plus a column, not a hunt through call sites.
 */

export function getPatchCacheDir(_db: Database.Database): string {
  return join(app.getPath('userData'), 'patches')
}

export function getPatchedRomDir(_db: Database.Database): string {
  return join(app.getPath('userData'), 'roms')
}

/** Cached, downscaled catalog thumbnails. Disposable - deleting it just means
 *  rows show placeholders until the next catalog refresh. */
export function getThumbnailDir(): string {
  return join(app.getPath('userData'), 'thumbs')
}
