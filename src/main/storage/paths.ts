import { app } from 'electron'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { getAppConfig } from '../db/appConfig'

/**
 * Single source of truth for where downloaded patches and patched ROMs live.
 *
 * The root defaults to userData but can be relocated (see storage/relocate.ts)
 * for portable setups - e.g. a folder the user keeps next to the app itself.
 * A null storage_root means "use the default", rather than a separate
 * boolean, so there's exactly one place that can go stale.
 */

export function getDefaultStorageRoot(): string {
  return app.getPath('userData')
}

export function getStorageRoot(db: Database.Database): string {
  return getAppConfig(db).storageRoot ?? getDefaultStorageRoot()
}

export function getPatchCacheDir(db: Database.Database): string {
  return join(getStorageRoot(db), 'patches')
}

export function getPatchedRomDir(db: Database.Database): string {
  return join(getStorageRoot(db), 'roms')
}

/** Cached, downscaled catalog thumbnails. Disposable - deleting it just means
 *  rows show placeholders until the next catalog refresh. Deliberately not
 *  affected by storage_root: it's a cache, not user output. */
export function getThumbnailDir(): string {
  return join(app.getPath('userData'), 'thumbs')
}
