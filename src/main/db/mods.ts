import type Database from 'better-sqlite3'

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
    fetchedAt: row.fetched_at
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

  const upsertMod = db.prepare(
    `INSERT INTO mods (id, source, source_id, name, author, description, metadata_json, fetched_at)
     VALUES (@id, @source, @sourceId, @name, @author, @description, @metadataJson, @fetchedAt)
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

const LIST_WITH_STATUS_SQL = `
  SELECT mods.*, mod_status.state, mod_status.patch_file_path, mod_status.patched_rom_path,
         mod_status.download_progress_bytes, mod_status.download_total_bytes,
         mod_status.error_message, mod_status.updated_at as status_updated_at
  FROM mods
  JOIN mod_status ON mod_status.mod_id = mods.id
`

interface JoinedRow extends ModRow {
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
    })
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
