import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../../src/main/db/migrations'
import {
  addEmulator,
  deleteEmulator,
  listEmulators,
  setDefaultEmulator,
  updateEmulator
} from '../../../src/main/db/emulators'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('emulators DAO', () => {
  it('starts empty', () => {
    const db = createDb()
    expect(listEmulators(db)).toEqual([])
    db.close()
  })

  it('makes the first added emulator the default automatically', () => {
    const db = createDb()
    const first = addEmulator(db, {
      name: 'RetroArch',
      executablePath: '/usr/bin/retroarch',
      argsTemplate: '{romPath}'
    })
    expect(first.isDefault).toBe(true)

    const second = addEmulator(db, {
      name: 'simple64',
      executablePath: '/usr/bin/simple64',
      argsTemplate: '{romPath}'
    })
    expect(second.isDefault).toBe(false)

    db.close()
  })

  it('updates an emulator in place', () => {
    const db = createDb()
    const emulator = addEmulator(db, {
      name: 'RetroArch',
      executablePath: '/usr/bin/retroarch',
      argsTemplate: '{romPath}'
    })

    const updated = updateEmulator(db, emulator.id, {
      name: 'RetroArch (renamed)',
      executablePath: '/usr/local/bin/retroarch',
      argsTemplate: '-L core.so {romPath}'
    })

    expect(updated.name).toBe('RetroArch (renamed)')
    expect(updated.executablePath).toBe('/usr/local/bin/retroarch')
    expect(updated.argsTemplate).toBe('-L core.so {romPath}')

    db.close()
  })

  it('only ever has one default at a time', () => {
    const db = createDb()
    const first = addEmulator(db, {
      name: 'A',
      executablePath: '/bin/a',
      argsTemplate: '{romPath}'
    })
    const second = addEmulator(db, {
      name: 'B',
      executablePath: '/bin/b',
      argsTemplate: '{romPath}'
    })

    setDefaultEmulator(db, second.id)

    const list = listEmulators(db)
    const defaults = list.filter((e) => e.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]?.id).toBe(second.id)
    expect(list.find((e) => e.id === first.id)?.isDefault).toBe(false)

    db.close()
  })

  it('promotes another emulator to default when the default is deleted', () => {
    const db = createDb()
    const first = addEmulator(db, {
      name: 'A',
      executablePath: '/bin/a',
      argsTemplate: '{romPath}'
    })
    const second = addEmulator(db, {
      name: 'B',
      executablePath: '/bin/b',
      argsTemplate: '{romPath}'
    })

    deleteEmulator(db, first.id)

    const list = listEmulators(db)
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(second.id)
    expect(list[0]?.isDefault).toBe(true)

    db.close()
  })

  it('records the known-emulator id and kind when seeded from the registry', () => {
    const db = createDb()
    const known = addEmulator(db, {
      name: 'RetroArch',
      executablePath: '/usr/bin/retroarch',
      argsTemplate: '{romPath}',
      knownId: 'retroarch'
    })
    expect(known.knownId).toBe('retroarch')
    expect(known.kind).toBe('known')

    const custom = addEmulator(db, {
      name: 'My Emulator',
      executablePath: '/usr/bin/my-emu',
      argsTemplate: '{romPath}'
    })
    expect(custom.knownId).toBeNull()
    expect(custom.kind).toBe('custom')

    db.close()
  })

  it('leaves no default when the last emulator is deleted', () => {
    const db = createDb()
    const only = addEmulator(db, {
      name: 'A',
      executablePath: '/bin/a',
      argsTemplate: '{romPath}'
    })

    deleteEmulator(db, only.id)

    expect(listEmulators(db)).toEqual([])
    db.close()
  })
})
