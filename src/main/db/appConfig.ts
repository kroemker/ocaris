import type Database from 'better-sqlite3'
import type { ThemeSource } from '@shared/ipc'
import type { RomVariant } from '../rom/checksums'

export interface AppConfig {
  romPath: string | null
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
  theme: ThemeSource
  /** Root directory for patches/roms, or null to use the default userData location. */
  storageRoot: string | null
  updatedAt: number | null
}

interface AppConfigRow {
  rom_path: string | null
  rom_variant: RomVariant | null
  rom_verified: number
  rom_user_confirmed: number
  theme: ThemeSource | null
  storage_root: string | null
  updated_at: number | null
}

const DEFAULT_THEME: ThemeSource = 'system'

const EMPTY_CONFIG: AppConfig = {
  romPath: null,
  romVariant: null,
  romVerified: false,
  romUserConfirmed: false,
  theme: DEFAULT_THEME,
  storageRoot: null,
  updatedAt: null
}

function rowToConfig(row: AppConfigRow): AppConfig {
  return {
    romPath: row.rom_path,
    romVariant: row.rom_variant,
    romVerified: row.rom_verified === 1,
    romUserConfirmed: row.rom_user_confirmed === 1,
    theme: row.theme ?? DEFAULT_THEME,
    storageRoot: row.storage_root,
    updatedAt: row.updated_at
  }
}

export function getAppConfig(db: Database.Database): AppConfig {
  const row = db
    .prepare(
      'SELECT rom_path, rom_variant, rom_verified, rom_user_confirmed, theme, storage_root, updated_at FROM app_config WHERE id = 1'
    )
    .get() as AppConfigRow | undefined

  return row ? rowToConfig(row) : EMPTY_CONFIG
}

export interface SaveRomConfigInput {
  romPath: string
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
}

export function saveRomConfig(db: Database.Database, input: SaveRomConfigInput): AppConfig {
  const updatedAt = Date.now()

  db.prepare(
    `INSERT INTO app_config (id, rom_path, rom_variant, rom_verified, rom_user_confirmed, updated_at)
     VALUES (1, @romPath, @romVariant, @romVerified, @romUserConfirmed, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       rom_path = excluded.rom_path,
       rom_variant = excluded.rom_variant,
       rom_verified = excluded.rom_verified,
       rom_user_confirmed = excluded.rom_user_confirmed,
       updated_at = excluded.updated_at`
  ).run({
    romPath: input.romPath,
    romVariant: input.romVariant,
    romVerified: input.romVerified ? 1 : 0,
    romUserConfirmed: input.romUserConfirmed ? 1 : 0,
    updatedAt
  })

  return getAppConfig(db)
}

/**
 * Writes only the theme column. The config row may not exist yet - the theme
 * can be changed before a ROM is ever picked - so this upserts, and the
 * conflict clause touches nothing but `theme` to avoid clobbering ROM fields.
 * `updated_at` is left alone for the same reason: it tracks the ROM config.
 */
export function saveTheme(db: Database.Database, theme: ThemeSource): AppConfig {
  db.prepare(
    `INSERT INTO app_config (id, theme) VALUES (1, @theme)
     ON CONFLICT(id) DO UPDATE SET theme = excluded.theme`
  ).run({ theme })

  return getAppConfig(db)
}

/**
 * Writes only the storage_root column, for the same reason saveTheme only
 * writes theme: the config row may not exist yet, and this must not clobber
 * ROM fields set independently. Pass null to fall back to the default
 * userData location.
 */
export function saveStorageRoot(db: Database.Database, storageRoot: string | null): AppConfig {
  db.prepare(
    `INSERT INTO app_config (id, storage_root) VALUES (1, @storageRoot)
     ON CONFLICT(id) DO UPDATE SET storage_root = excluded.storage_root`
  ).run({ storageRoot })

  return getAppConfig(db)
}
