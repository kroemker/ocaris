import type Database from 'better-sqlite3'
import type { ModPrefs, ModPrefsPatch } from '@shared/ipc'

/**
 * Per-mod user choices (favourite, hidden, remembered emulator). Rows are
 * written lazily - a mod nobody has touched has no row at all - so every read
 * has to answer for a missing one, which is what DEFAULT_MOD_PREFS is.
 */

export const DEFAULT_MOD_PREFS: ModPrefs = {
  favorite: false,
  hidden: false,
  emulatorId: null
}

export interface ModPrefsRow {
  favorite: number | null
  hidden: number | null
  emulator_id: number | null
}

/** SQLite has no boolean type, so the integers are converted on the way out. */
export function rowToModPrefs(row: Partial<ModPrefsRow> | null | undefined): ModPrefs {
  if (!row) return DEFAULT_MOD_PREFS
  return {
    favorite: row.favorite === 1,
    hidden: row.hidden === 1,
    emulatorId: row.emulator_id ?? null
  }
}

export function getModPrefs(db: Database.Database, modId: string): ModPrefs {
  const row = db.prepare('SELECT * FROM mod_prefs WHERE mod_id = ?').get(modId) as
    ModPrefsRow | undefined
  return rowToModPrefs(row)
}

/**
 * Applies a partial change, creating the row if this is the first one. The
 * merge happens here rather than in SQL so a patch of one field can't reset
 * the others to their defaults.
 */
export function setModPrefs(db: Database.Database, modId: string, patch: ModPrefsPatch): ModPrefs {
  const next: ModPrefs = { ...getModPrefs(db, modId), ...patch }

  db.prepare(
    `INSERT INTO mod_prefs (mod_id, favorite, hidden, emulator_id, updated_at)
     VALUES (@modId, @favorite, @hidden, @emulatorId, @updatedAt)
     ON CONFLICT(mod_id) DO UPDATE SET
       favorite = excluded.favorite,
       hidden = excluded.hidden,
       emulator_id = excluded.emulator_id,
       updated_at = excluded.updated_at`
  ).run({
    modId,
    favorite: next.favorite ? 1 : 0,
    hidden: next.hidden ? 1 : 0,
    emulatorId: next.emulatorId,
    updatedAt: Date.now()
  })

  return next
}
