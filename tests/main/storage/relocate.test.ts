import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
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

describe('relocateStorage', () => {
  it('moves patch and ROM files and rewrites mod_status paths', async () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')

    const oldPatchCacheDir = tmp('ocaris-old-patches-')
    const oldPatchedRomDir = tmp('ocaris-old-roms-')
    const newRoot = tmp('ocaris-new-')
    const newPatchCacheDir = join(newRoot, 'patches')
    const newPatchedRomDir = join(newRoot, 'roms')

    writeFileSync(join(oldPatchCacheDir, 'hylianmodding_42.bps'), 'patch-bytes')
    writeFileSync(join(oldPatchedRomDir, 'hylianmodding_42.z64'), 'rom-bytes')

    setModStatus(db, id, {
      state: 'ready',
      patchFilePath: join(oldPatchCacheDir, 'hylianmodding_42.bps'),
      patchedRomPath: join(oldPatchedRomDir, 'hylianmodding_42.z64')
    })

    await relocateStorage({
      db,
      oldPatchCacheDir,
      oldPatchedRomDir,
      newPatchCacheDir,
      newPatchedRomDir
    })

    expect(existsSync(join(oldPatchCacheDir, 'hylianmodding_42.bps'))).toBe(false)
    expect(existsSync(join(oldPatchedRomDir, 'hylianmodding_42.z64'))).toBe(false)
    expect(readFileSync(join(newPatchCacheDir, 'hylianmodding_42.bps'), 'utf8')).toBe('patch-bytes')
    expect(readFileSync(join(newPatchedRomDir, 'hylianmodding_42.z64'), 'utf8')).toBe('rom-bytes')

    const status = db.prepare('SELECT * FROM mod_status WHERE mod_id = ?').get(id) as {
      state: string
      patch_file_path: string
      patched_rom_path: string
    }
    expect(status.state).toBe('ready')
    expect(status.patch_file_path).toBe(join(newPatchCacheDir, 'hylianmodding_42.bps'))
    expect(status.patched_rom_path).toBe(join(newPatchedRomDir, 'hylianmodding_42.z64'))

    db.close()
  })

  it('is a no-op when nothing has been downloaded yet', async () => {
    const db = createDb()
    const oldPatchCacheDir = join(tmp('ocaris-old-'), 'patches')
    const oldPatchedRomDir = join(tmpdir(), 'does-not-exist-roms')
    const newRoot = tmp('ocaris-new-')

    await expect(
      relocateStorage({
        db,
        oldPatchCacheDir,
        oldPatchedRomDir,
        newPatchCacheDir: join(newRoot, 'patches'),
        newPatchedRomDir: join(newRoot, 'roms')
      })
    ).resolves.toBeUndefined()

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
      newPatchCacheDir: dir,
      newPatchedRomDir: dir
    })

    expect(readFileSync(join(dir, 'file.bps'), 'utf8')).toBe('unchanged')
    db.close()
  })

  it('leaves mods that were never installed untouched', async () => {
    const db = createDb()
    upsertMods(db, [sampleMod])
    const id = modId('hylianmodding', '42')

    await relocateStorage({
      db,
      oldPatchCacheDir: tmp('ocaris-old-patches-'),
      oldPatchedRomDir: tmp('ocaris-old-roms-'),
      newPatchCacheDir: join(tmp('ocaris-new-'), 'patches'),
      newPatchedRomDir: join(tmp('ocaris-new-'), 'roms')
    })

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
