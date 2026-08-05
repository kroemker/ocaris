import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { saveRomConfig } from '../../../src/main/db/appConfig'
import { addEmulator } from '../../../src/main/db/emulators'
import { runMigrations } from '../../../src/main/db/migrations'
import { modId, setModStatus, upsertMods, type ModRecord } from '../../../src/main/db/mods'
import { assertWritableDirectory, relocateStorage } from '../../../src/main/storage/relocate'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

const sampleMod: ModRecord = {
  source: 'hylianmodding',
  sourceId: '42',
  name: 'Ships of Hyrule',
  author: null,
  description: null,
  metadata: null
}

interface Dirs {
  oldPatchCacheDir: string
  oldPatchedRomDir: string
  oldBaseRomDir: string
  oldEmulatorInstallDir: string
  newPatchCacheDir: string
  newPatchedRomDir: string
  newBaseRomDir: string
  newEmulatorInstallDir: string
}

function freshDirs(): Dirs {
  const newRoot = tmp('ocaris-new-')
  return {
    oldPatchCacheDir: tmp('ocaris-old-patches-'),
    oldPatchedRomDir: tmp('ocaris-old-roms-'),
    oldBaseRomDir: tmp('ocaris-old-base-'),
    oldEmulatorInstallDir: tmp('ocaris-old-emulators-'),
    newPatchCacheDir: join(newRoot, 'patches'),
    newPatchedRomDir: join(newRoot, 'roms'),
    newBaseRomDir: join(newRoot, 'base'),
    newEmulatorInstallDir: join(newRoot, 'emulators')
  }
}

describe('relocateStorage', () => {
  it('moves patch and ROM files and rewrites mod_status paths', async () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')
    const dirs = freshDirs()

    writeFileSync(join(dirs.oldPatchCacheDir, 'hylianmodding_42.bps'), 'patch-bytes')
    writeFileSync(join(dirs.oldPatchedRomDir, 'hylianmodding_42.z64'), 'rom-bytes')

    setModStatus(db, id, {
      state: 'ready',
      patchFilePath: join(dirs.oldPatchCacheDir, 'hylianmodding_42.bps'),
      patchedRomPath: join(dirs.oldPatchedRomDir, 'hylianmodding_42.z64')
    })

    await relocateStorage({ db, ...dirs })

    expect(existsSync(join(dirs.oldPatchCacheDir, 'hylianmodding_42.bps'))).toBe(false)
    expect(existsSync(join(dirs.oldPatchedRomDir, 'hylianmodding_42.z64'))).toBe(false)
    expect(readFileSync(join(dirs.newPatchCacheDir, 'hylianmodding_42.bps'), 'utf8')).toBe(
      'patch-bytes'
    )
    expect(readFileSync(join(dirs.newPatchedRomDir, 'hylianmodding_42.z64'), 'utf8')).toBe(
      'rom-bytes'
    )

    const status = db.prepare('SELECT * FROM mod_status WHERE mod_id = ?').get(id) as {
      state: string
      patch_file_path: string
      patched_rom_path: string
    }
    expect(status.state).toBe('ready')
    expect(status.patch_file_path).toBe(join(dirs.newPatchCacheDir, 'hylianmodding_42.bps'))
    expect(status.patched_rom_path).toBe(join(dirs.newPatchedRomDir, 'hylianmodding_42.z64'))

    db.close()
  })

  it('moves the base ROM copy and rewrites app_config.rom_path', async () => {
    const db = createDb()
    const dirs = freshDirs()

    const oldRomPath = join(dirs.oldBaseRomDir, 'base.z64')
    writeFileSync(oldRomPath, 'base-rom-bytes')
    const saved = saveRomConfig(db, {
      romPath: oldRomPath,
      romVariant: 'decompressed',
      romVerified: true,
      romUserConfirmed: true
    })

    await relocateStorage({ db, ...dirs })

    expect(existsSync(oldRomPath)).toBe(false)
    const newRomPath = join(dirs.newBaseRomDir, 'base.z64')
    expect(readFileSync(newRomPath, 'utf8')).toBe('base-rom-bytes')

    const row = db.prepare('SELECT rom_path FROM app_config WHERE id = 1').get() as {
      rom_path: string
    }
    expect(row.rom_path).toBe(newRomPath)
    // Only the path moved - nothing else about the ROM config changed.
    expect(saved.romVariant).toBe('decompressed')

    db.close()
  })

  it('moves installed emulator files and rewrites emulators.executable_path', async () => {
    const db = createDb()
    const dirs = freshDirs()

    const oldExeDir = join(dirs.oldEmulatorInstallDir, 'ares')
    const oldExePath = join(oldExeDir, 'ares')
    mkdirSync(oldExeDir, { recursive: true })
    writeFileSync(oldExePath, 'binary-bytes')

    const added = addEmulator(db, {
      name: 'ares',
      executablePath: oldExePath,
      argsTemplate: '{romPath}',
      knownId: 'ares'
    })

    await relocateStorage({ db, ...dirs })

    const newExePath = join(dirs.newEmulatorInstallDir, 'ares', 'ares')
    expect(existsSync(oldExePath)).toBe(false)
    expect(readFileSync(newExePath, 'utf8')).toBe('binary-bytes')

    const row = db.prepare('SELECT executable_path FROM emulators WHERE id = ?').get(added.id) as {
      executable_path: string
    }
    expect(row.executable_path).toBe(newExePath)

    db.close()
  })

  it('is a no-op when nothing has been downloaded or configured yet', async () => {
    const db = createDb()
    const dirs = freshDirs()

    await expect(relocateStorage({ db, ...dirs })).resolves.toBeUndefined()

    db.close()
  })

  it('does nothing when the old and new locations are the same', async () => {
    const db = createDb()
    const dir = tmp('ocaris-same-')
    writeFileSync(join(dir, 'file.bps'), 'unchanged')

    await relocateStorage({
      db,
      oldPatchCacheDir: dir,
      oldPatchedRomDir: dir,
      oldBaseRomDir: dir,
      oldEmulatorInstallDir: dir,
      newPatchCacheDir: dir,
      newPatchedRomDir: dir,
      newBaseRomDir: dir,
      newEmulatorInstallDir: dir
    })

    expect(readFileSync(join(dir, 'file.bps'), 'utf8')).toBe('unchanged')
    db.close()
  })

  it('leaves mods that were never installed untouched', async () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')

    await relocateStorage({ db, ...freshDirs() })

    const status = db
      .prepare('SELECT patch_file_path, patched_rom_path FROM mod_status WHERE mod_id = ?')
      .get(id) as {
      patch_file_path: string | null
      patched_rom_path: string | null
    }
    expect(status.patch_file_path).toBeNull()
    expect(status.patched_rom_path).toBeNull()

    db.close()
  })
})

describe('assertWritableDirectory', () => {
  it('creates the directory if missing and succeeds when writable', async () => {
    const dir = join(tmp('ocaris-writable-'), 'nested', 'deeper')
    await expect(assertWritableDirectory(dir)).resolves.toBeUndefined()
    expect(existsSync(dir)).toBe(true)
  })
})
