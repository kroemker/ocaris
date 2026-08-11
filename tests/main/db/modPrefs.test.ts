import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/migrations'
import { DEFAULT_MOD_PREFS, getModPrefs, setModPrefs } from '../../../src/main/db/modPrefs'
import { listModsWithStatus, modId, setModStatus, upsertMods } from '../../../src/main/db/mods'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  upsertMods(db, [
    {
      source: 'hylianmodding',
      sourceId: '42',
      name: 'Ships of Hyrule',
      author: 'Some Modder',
      description: null,
      metadata: null
    }
  ])
  // mod_prefs.emulator_id is a real foreign key, so the emulators a test
  // points at have to exist.
  for (const id of [3, 7]) {
    db.prepare(
      `INSERT INTO emulators (id, name, executable_path, created_at, updated_at)
       VALUES (?, 'Emu', '/usr/bin/emu', 0, 0)`
    ).run(id)
  }
  return db
}

const ID = modId('hylianmodding', '42')

describe('mod prefs DAO', () => {
  it('reads defaults for a mod nobody has touched', () => {
    const db = createDb()
    expect(getModPrefs(db, ID)).toEqual(DEFAULT_MOD_PREFS)
    // No row is written just by reading.
    expect(db.prepare('SELECT COUNT(*) as n FROM mod_prefs').get()).toEqual({ n: 0 })
    db.close()
  })

  it('creates the row on first write and merges later patches', () => {
    const db = createDb()

    expect(setModPrefs(db, ID, { favorite: true })).toEqual({
      favorite: true,
      hidden: false,
      emulatorId: null
    })

    // A patch of one field leaves the others alone rather than resetting them.
    expect(setModPrefs(db, ID, { emulatorId: 7 })).toEqual({
      favorite: true,
      hidden: false,
      emulatorId: 7
    })
    expect(getModPrefs(db, ID)).toEqual({ favorite: true, hidden: false, emulatorId: 7 })

    db.close()
  })

  it('joins onto the mod list, defaults included', () => {
    const db = createDb()
    expect(listModsWithStatus(db)[0].prefs).toEqual(DEFAULT_MOD_PREFS)

    setModPrefs(db, ID, { hidden: true })
    expect(listModsWithStatus(db)[0].prefs).toEqual({
      favorite: false,
      hidden: true,
      emulatorId: null
    })

    db.close()
  })

  /** Removing a mod's patched ROM resets its status; a favourite is not part
   *  of that and has to survive. */
  it('outlives a status reset', () => {
    const db = createDb()
    setModPrefs(db, ID, { favorite: true, emulatorId: 3 })

    setModStatus(db, ID, {
      state: 'not_downloaded',
      patchFilePath: null,
      patchedRomPath: null,
      errorMessage: null
    })

    expect(getModPrefs(db, ID)).toEqual({ favorite: true, hidden: false, emulatorId: 3 })
    db.close()
  })
})
