import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/migrations'
import { getAppConfig, saveRomConfig } from '../../../src/main/db/appConfig'

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
})
