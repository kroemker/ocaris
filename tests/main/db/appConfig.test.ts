import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/migrations'
import {
  getAppConfig,
  getWindowBoundsJson,
  saveRomConfig,
  saveStorageRoot,
  saveTheme,
  saveUiState,
  saveWindowBounds
} from '../../../src/main/db/appConfig'
import { DEFAULT_UI_STATE } from '../../../src/shared/uiState'
import type { UiState } from '../../../src/shared/ipc'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('appConfig DAO', () => {
  it('returns an empty config when nothing has been saved yet', () => {
    const db = createDb()
    expect(getAppConfig(db)).toEqual({
      romPath: null,
      romVariant: null,
      romVerified: false,
      romUserConfirmed: false,
      theme: 'system',
      storageRoot: null,
      uiState: DEFAULT_UI_STATE,
      updatedAt: null
    })
    db.close()
  })

  it('saves and re-reads a verified ROM config', () => {
    const db = createDb()

    const saved = saveRomConfig(db, {
      romPath: '/roms/oot.z64',
      romVariant: 'decompressed',
      romVerified: true,
      romUserConfirmed: true
    })

    expect(saved.romPath).toBe('/roms/oot.z64')
    expect(saved.romVariant).toBe('decompressed')
    expect(saved.romVerified).toBe(true)
    expect(typeof saved.updatedAt).toBe('number')

    expect(getAppConfig(db)).toEqual(saved)

    db.close()
  })

  it('overwrites the previous config on a second save (single-row upsert)', () => {
    const db = createDb()

    saveRomConfig(db, {
      romPath: '/roms/first.z64',
      romVariant: 'compressed',
      romVerified: true,
      romUserConfirmed: true
    })
    saveRomConfig(db, {
      romPath: '/roms/second.z64',
      romVariant: null,
      romVerified: false,
      romUserConfirmed: true
    })

    const config = getAppConfig(db)
    expect(config.romPath).toBe('/roms/second.z64')
    expect(config.romVerified).toBe(false)

    const rowCount = db.prepare('SELECT COUNT(*) as count FROM app_config').get() as {
      count: number
    }
    expect(rowCount.count).toBe(1)

    db.close()
  })

  it('saves a theme before any ROM has been configured', () => {
    const db = createDb()

    const config = saveTheme(db, 'light')

    expect(config.theme).toBe('light')
    expect(config.romPath).toBeNull()
    expect(getAppConfig(db).theme).toBe('light')

    db.close()
  })

  it('leaves the ROM config untouched when the theme changes', () => {
    const db = createDb()

    const saved = saveRomConfig(db, {
      romPath: '/roms/oot.z64',
      romVariant: 'compressed',
      romVerified: true,
      romUserConfirmed: true
    })

    saveTheme(db, 'dark')

    expect(getAppConfig(db)).toEqual({ ...saved, theme: 'dark' })

    db.close()
  })

  it('saves a storage root before any ROM has been configured', () => {
    const db = createDb()

    const config = saveStorageRoot(db, '/portable/ocaris')

    expect(config.storageRoot).toBe('/portable/ocaris')
    expect(config.romPath).toBeNull()
    expect(getAppConfig(db).storageRoot).toBe('/portable/ocaris')

    db.close()
  })

  it('resets the storage root to the default with null', () => {
    const db = createDb()

    saveStorageRoot(db, '/portable/ocaris')
    const reset = saveStorageRoot(db, null)

    expect(reset.storageRoot).toBeNull()

    db.close()
  })

  it('leaves the ROM config and theme untouched when the storage root changes', () => {
    const db = createDb()

    const saved = saveRomConfig(db, {
      romPath: '/roms/oot.z64',
      romVariant: 'compressed',
      romVerified: true,
      romUserConfirmed: true
    })
    saveTheme(db, 'dark')

    saveStorageRoot(db, '/portable/ocaris')

    expect(getAppConfig(db)).toEqual({
      ...saved,
      theme: 'dark',
      storageRoot: '/portable/ocaris'
    })

    db.close()
  })

  const UI_STATE: UiState = {
    library: { filter: 'ready', sort: 'author', groupByState: true, query: 'kaizo' },
    settingsPane: 'emulators'
  }

  it('saves and re-reads the UI state', () => {
    const db = createDb()

    expect(saveUiState(db, UI_STATE).uiState).toEqual(UI_STATE)
    expect(getAppConfig(db).uiState).toEqual(UI_STATE)

    db.close()
  })

  it('leaves the ROM config, theme and storage root untouched when the UI state changes', () => {
    const db = createDb()

    const saved = saveRomConfig(db, {
      romPath: '/roms/oot.z64',
      romVariant: 'compressed',
      romVerified: true,
      romUserConfirmed: true
    })
    saveTheme(db, 'dark')
    saveStorageRoot(db, '/portable/ocaris')

    saveUiState(db, UI_STATE)

    expect(getAppConfig(db)).toEqual({
      ...saved,
      theme: 'dark',
      storageRoot: '/portable/ocaris',
      uiState: UI_STATE
    })

    db.close()
  })

  it('falls back to the default UI state when the stored JSON is unreadable', () => {
    const db = createDb()

    saveUiState(db, UI_STATE)
    db.prepare('UPDATE app_config SET ui_state_json = ? WHERE id = 1').run('{not json')

    expect(getAppConfig(db).uiState).toEqual(DEFAULT_UI_STATE)

    db.close()
  })

  it('stores window bounds without disturbing the rest of the config', () => {
    const db = createDb()

    const saved = saveTheme(db, 'light')
    saveWindowBounds(db, { x: 10, y: 20, width: 800, height: 600, maximized: true })

    expect(JSON.parse(getWindowBoundsJson(db) ?? 'null')).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      maximized: true
    })
    expect(getAppConfig(db)).toEqual(saved)

    db.close()
  })

  it('reports no stored window bounds before anything has been saved', () => {
    const db = createDb()

    expect(getWindowBoundsJson(db)).toBeNull()

    db.close()
  })
})
