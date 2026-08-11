import type Database from 'better-sqlite3'
import type { ThemeSource, UiState, WindowBounds } from '@shared/ipc'
import { DEFAULT_UI_STATE, parseUiState } from '@shared/uiState'
import type { RomVariant } from '../rom/checksums'

export interface AppConfig {
  romPath: string | null
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
  theme: ThemeSource
  /** Root directory for patches/roms, or null to use the default userData location. */
  storageRoot: string | null
  /** Renderer view state - filters, sort, search, last settings pane. */
  uiState: UiState
  updatedAt: number | null
}

interface AppConfigRow {
  rom_path: string | null
  rom_variant: RomVariant | null
  rom_verified: number
  rom_user_confirmed: number
  theme: ThemeSource | null
  storage_root: string | null
  ui_state_json: string | null
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
  uiState: DEFAULT_UI_STATE,
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
    uiState: parseUiState(row.ui_state_json),
    updatedAt: row.updated_at
  }
}

export function getAppConfig(db: Database.Database): AppConfig {
  const row = db
    .prepare(
      'SELECT rom_path, rom_variant, rom_verified, rom_user_confirmed, theme, storage_root, ui_state_json, updated_at FROM app_config WHERE id = 1'
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

/**
 * Writes only the ui_state_json column, for the same reason saveTheme only
 * writes theme. Callers pass a whole UiState rather than a patch: the renderer
 * owns this value end to end, so merging in two places would only invite the
 * two copies to disagree.
 */
export function saveUiState(db: Database.Database, uiState: UiState): AppConfig {
  db.prepare(
    `INSERT INTO app_config (id, ui_state_json) VALUES (1, @uiState)
     ON CONFLICT(id) DO UPDATE SET ui_state_json = excluded.ui_state_json`
  ).run({ uiState: JSON.stringify(uiState) })

  return getAppConfig(db)
}

/**
 * Window bounds live in app_config but stay out of AppConfig: main is the only
 * side that reads or writes them, and nothing that asks for the config wants
 * them. Returns the raw JSON so the caller can normalize it against the
 * displays actually attached right now.
 */
export function getWindowBoundsJson(db: Database.Database): string | null {
  const row = db.prepare('SELECT window_bounds_json FROM app_config WHERE id = 1').get() as
    { window_bounds_json: string | null } | undefined

  return row?.window_bounds_json ?? null
}

export function saveWindowBounds(db: Database.Database, bounds: WindowBounds): void {
  db.prepare(
    `INSERT INTO app_config (id, window_bounds_json) VALUES (1, @bounds)
     ON CONFLICT(id) DO UPDATE SET window_bounds_json = excluded.window_bounds_json`
  ).run({ bounds: JSON.stringify(bounds) })
}
