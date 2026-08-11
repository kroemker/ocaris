import type Database from 'better-sqlite3'
import type { ModPrefs } from '@shared/ipc'
import { rowToModPrefs, type ModPrefsRow } from './modPrefs'

export type ModStatusState = 'not_downloaded' | 'downloading' | 'ready' | 'error'

export interface ModRecord {
  source: string
  sourceId: string
  name: string
  author: string | null
  description: string | null
  /** Source-specific extra fields (download URL, patch format, etc.), stored as-is. */
  metadata: unknown
}

export interface Mod {
  id: string
  source: string
  sourceId: string
  name: string
  author: string | null
  description: string | null
  metadata: unknown
  fetchedAt: number
  /** When this mod was first seen in any catalog refresh; never updated after insert. */
  firstSeenAt: number | null
}

export interface ModStatus {
  modId: string
  state: ModStatusState
  patchFilePath: string | null
  patchedRomPath: string | null
  downloadProgressBytes: number | null
  downloadTotalBytes: number | null
  errorMessage: string | null
  updatedAt: number
}

export interface ModWithStatus extends Mod {
  status: ModStatus
  prefs: ModPrefs
}

interface ModRow {
  id: string
  source: string
  source_id: string
  name: string
  author: string | null
  description: string | null
  metadata_json: string | null
  fetched_at: number
  first_seen_at: number | null
}

interface ModStatusRow {
  mod_id: string
  state: ModStatusState
  patch_file_path: string | null
  patched_rom_path: string | null
  download_progress_bytes: number | null
  download_total_bytes: number | null
  error_message: string | null
  updated_at: number
}

export function modId(source: string, sourceId: string): string {
  return `${source}:${sourceId}`
}

function rowToMod(row: ModRow): Mod {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    name: row.name,
    author: row.author,
    description: row.description,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    fetchedAt: row.fetched_at,
    firstSeenAt: row.first_seen_at
  }
}

function rowToModStatus(row: ModStatusRow): ModStatus {
  return {
    modId: row.mod_id,
    state: row.state,
    patchFilePath: row.patch_file_path,
    patchedRomPath: row.patched_rom_path,
    downloadProgressBytes: row.download_progress_bytes,
    downloadTotalBytes: row.download_total_bytes,
    errorMessage: row.error_message,
    updatedAt: row.updated_at
  }
}

/**
 * Inserts or refreshes catalog entries. Existing download/patch status is
 * left untouched - only newly-seen mods get a default 'not_downloaded'
 * status row - so a catalog refresh never resets in-progress or completed
 * downloads.
 */
export function upsertMods(db: Database.Database, records: ModRecord[]): void {
  const now = Date.now()

  // first_seen_at is deliberately absent from the DO UPDATE clause: it records
  // when a mod first showed up, so a later refresh must not move it.
  const upsertMod = db.prepare(
    `INSERT INTO mods (id, source, source_id, name, author, description, metadata_json, fetched_at, first_seen_at)
     VALUES (@id, @source, @sourceId, @name, @author, @description, @metadataJson, @fetchedAt, @fetchedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       author = excluded.author,
       description = excluded.description,
       metadata_json = excluded.metadata_json,
       fetched_at = excluded.fetched_at`
  )

  const insertDefaultStatus = db.prepare(
    `INSERT OR IGNORE INTO mod_status (mod_id, state, updated_at) VALUES (?, 'not_downloaded', ?)`
  )

  const upsertAll = db.transaction((entries: ModRecord[]) => {
    for (const record of entries) {
      const id = modId(record.source, record.sourceId)
      upsertMod.run({
        id,
        source: record.source,
        sourceId: record.sourceId,
        name: record.name,
        author: record.author,
        description: record.description,
        metadataJson: record.metadata === null ? null : JSON.stringify(record.metadata),
        fetchedAt: now
      })
      insertDefaultStatus.run(id, now)
    }
  })

  upsertAll(records)
}

export interface CatalogStats {
  count: number
  /**
   * When the catalog was last refreshed. Every refresh rewrites fetched_at on
   * every row it saw, so the maximum is the last refresh - no separate
   * bookkeeping needed.
   */
  refreshedAt: number | null
}

export function getCatalogStats(db: Database.Database): CatalogStats {
  const row = db
    .prepare('SELECT COUNT(*) as count, MAX(fetched_at) as refreshed_at FROM mods')
    .get() as { count: number; refreshed_at: number | null }

  return { count: row.count, refreshedAt: row.refreshed_at }
}

// LEFT JOIN for mod_prefs, INNER for mod_status: every mod has a status row
// (upsertMods creates one), but a prefs row only exists once the user has
// favourited, hidden or picked an emulator for that mod.
const LIST_WITH_STATUS_SQL = `
  SELECT mods.*, mod_status.state, mod_status.patch_file_path, mod_status.patched_rom_path,
         mod_status.download_progress_bytes, mod_status.download_total_bytes,
         mod_status.error_message, mod_status.updated_at as status_updated_at,
         mod_prefs.favorite, mod_prefs.hidden, mod_prefs.emulator_id
  FROM mods
  JOIN mod_status ON mod_status.mod_id = mods.id
  LEFT JOIN mod_prefs ON mod_prefs.mod_id = mods.id
`

interface JoinedRow extends ModRow, Partial<ModPrefsRow> {
  state: ModStatusState
  patch_file_path: string | null
  patched_rom_path: string | null
  download_progress_bytes: number | null
  download_total_bytes: number | null
  error_message: string | null
  status_updated_at: number
}

function rowToModWithStatus(row: JoinedRow): ModWithStatus {
  return {
    ...rowToMod(row),
    status: rowToModStatus({
      mod_id: row.id,
      state: row.state,
      patch_file_path: row.patch_file_path,
      patched_rom_path: row.patched_rom_path,
      download_progress_bytes: row.download_progress_bytes,
      download_total_bytes: row.download_total_bytes,
      error_message: row.error_message,
      updated_at: row.status_updated_at
    }),
    prefs: rowToModPrefs(row)
  }
}

export function listModsWithStatus(db: Database.Database): ModWithStatus[] {
  const rows = db
    .prepare(`${LIST_WITH_STATUS_SQL} ORDER BY mods.name COLLATE NOCASE`)
    .all() as JoinedRow[]
  return rows.map(rowToModWithStatus)
}

export function getModWithStatus(db: Database.Database, id: string): ModWithStatus | null {
  const row = db.prepare(`${LIST_WITH_STATUS_SQL} WHERE mods.id = ?`).get(id) as
    JoinedRow | undefined
  return row ? rowToModWithStatus(row) : null
}

export type ModStatusPatch = Partial<
  Pick<
    ModStatus,
    | 'state'
    | 'patchFilePath'
    | 'patchedRomPath'
    | 'downloadProgressBytes'
    | 'downloadTotalBytes'
    | 'errorMessage'
  >
>

export function setModStatus(
  db: Database.Database,
  targetModId: string,
  patch: ModStatusPatch
): ModStatus {
  const row = db.prepare('SELECT * FROM mod_status WHERE mod_id = ?').get(targetModId) as
    ModStatusRow | undefined
  if (!row) {
    throw new Error(`No mod_status row for mod ${targetModId}`)
  }

  const next: ModStatus = { ...rowToModStatus(row), ...patch, updatedAt: Date.now() }

  db.prepare(
    `UPDATE mod_status SET state = @state, patch_file_path = @patchFilePath,
       patched_rom_path = @patchedRomPath, download_progress_bytes = @downloadProgressBytes,
       download_total_bytes = @downloadTotalBytes, error_message = @errorMessage,
       updated_at = @updatedAt
     WHERE mod_id = @modId`
  ).run(next)

  return next
}
