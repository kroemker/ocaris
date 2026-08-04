import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/migrations'
import {
  getModWithStatus,
  listModsWithStatus,
  modId,
  setModStatus,
  upsertMods,
  type ModRecord
} from '../../../src/main/db/mods'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

const sampleMod: ModRecord = {
  source: 'hylianmodding',
  sourceId: '42',
  name: 'Ships of Hyrule',
  author: 'Some Modder',
  description: 'A fun romhack.',
  metadata: { downloadUrl: 'https://example.com/patch.bps', patchFormat: 'bps' }
}

describe('mods DAO', () => {
  it('starts empty', () => {
    const db = createDb()
    expect(listModsWithStatus(db)).toEqual([])
    db.close()
  })

  it('upserts a mod with a default not_downloaded status', () => {
    const db = createDb()
    upsertMods(db, [sampleMod])

    const id = modId('hylianmodding', '42')
    const mod = getModWithStatus(db, id)

    expect(mod).not.toBeNull()
    expect(mod?.name).toBe('Ships of Hyrule')
    expect(mod?.metadata).toEqual({
      downloadUrl: 'https://example.com/patch.bps',
      patchFormat: 'bps'
    })
    expect(mod?.status.state).toBe('not_downloaded')

    db.close()
  })

  it('refreshing a catalog updates mod fields but preserves existing status', () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')

    setModStatus(db, id, { state: 'ready', patchedRomPath: '/roms/patched/42.z64' })

    // Simulate a later catalog refresh with an updated description.
    upsertMods(db, [{ ...sampleMod, description: 'Updated description.' }])

    const mod = getModWithStatus(db, id)
    expect(mod?.description).toBe('Updated description.')
    expect(mod?.status.state).toBe('ready')
    expect(mod?.status.patchedRomPath).toBe('/roms/patched/42.z64')

    db.close()
  })

  it('lists mods ordered by name', () => {
    const db = createDb()
    upsertMods(db, [
      { ...sampleMod, sourceId: '1', name: 'Zelda Mod' },
      { ...sampleMod, sourceId: '2', name: 'Ape Mod' }
    ])

    const names = listModsWithStatus(db).map((m) => m.name)
    expect(names).toEqual(['Ape Mod', 'Zelda Mod'])

    db.close()
  })

  it('partially updates mod_status via setModStatus', () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')

    setModStatus(db, id, {
      state: 'downloading',
      downloadProgressBytes: 1024,
      downloadTotalBytes: 4096
    })

    let status = getModWithStatus(db, id)?.status
    expect(status?.state).toBe('downloading')
    expect(status?.downloadProgressBytes).toBe(1024)

    // A later partial update should not clobber fields it doesn't mention.
    setModStatus(db, id, { downloadProgressBytes: 4096 })
    status = getModWithStatus(db, id)?.status
    expect(status?.state).toBe('downloading')
    expect(status?.downloadProgressBytes).toBe(4096)
    expect(status?.downloadTotalBytes).toBe(4096)

    db.close()
  })

  it('returns null for an unknown mod id', () => {
    const db = createDb()
    expect(getModWithStatus(db, 'nope:1')).toBeNull()
    db.close()
  })

  it('throws when setting status on a mod that does not exist', () => {
    const db = createDb()
    expect(() => setModStatus(db, 'nope:1', { state: 'ready' })).toThrow()
    db.close()
  })
})
