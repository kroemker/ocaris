import type Database from 'better-sqlite3'
import type { RomVariant } from '../rom/checksums'

export interface AppConfig {
  romPath: string | null
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
  updatedAt: number | null
}

interface AppConfigRow {
  rom_path: string | null
  rom_variant: RomVariant | null
  rom_verified: number
  rom_user_confirmed: number
  updated_at: number | null
}

const EMPTY_CONFIG: AppConfig = {
  romPath: null,
  romVariant: null,
  romVerified: false,
  romUserConfirmed: false,
  updatedAt: null
}

function rowToConfig(row: AppConfigRow): AppConfig {
  return {
    romPath: row.rom_path,
    romVariant: row.rom_variant,
    romVerified: row.rom_verified === 1,
    romUserConfirmed: row.rom_user_confirmed === 1,
    updatedAt: row.updated_at
  }
}

export function getAppConfig(db: Database.Database): AppConfig {
  const row = db
    .prepare(
      'SELECT rom_path, rom_variant, rom_verified, rom_user_confirmed, updated_at FROM app_config WHERE id = 1'
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
