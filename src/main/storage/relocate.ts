import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

/**
 * Creates the target if needed and confirms it's actually writable, by
 * writing and removing a probe file. Installed builds can point this at
 * read-only locations (Program Files without elevation, a signed .app
 * bundle) where mkdir alone would not catch the problem.
 */
export async function assertWritableDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const probe = join(dir, `.ocaris-write-test-${Date.now()}`)
  try {
    await writeFile(probe, '')
  } catch {
    throw new Error(`Can't write to "${dir}" - choose a different folder.`)
  } finally {
    await rm(probe, { force: true })
  }
}

async function moveDirContents(from: string, to: string): Promise<void> {
  if (from === to) return

  let entries: string[]
  try {
    entries = await readdir(from)
  } catch {
    // Nothing has been stored there yet.
    return
  }

  await mkdir(to, { recursive: true })

  for (const entry of entries) {
    const src = join(from, entry)
    const dest = join(to, entry)
    try {
      await rename(src, dest)
    } catch (err) {
      // rename() can't cross filesystems/drives (EXDEV) - fall back to a copy.
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
      await copyFile(src, dest)
      await rm(src, { force: true })
    }
  }
}

/** Rewrites `path` from living under `fromDir` to the equivalent spot under
 *  `toDir`, or leaves it alone if it isn't under `fromDir`. */
function rebase(path: string | null, fromDir: string, toDir: string): string | null {
  if (!path || !path.startsWith(fromDir)) return path
  return toDir + path.slice(fromDir.length)
}

export interface RelocateStorageInput {
  db: Database.Database
  oldPatchCacheDir: string
  oldPatchedRomDir: string
  oldBaseRomDir: string
  newPatchCacheDir: string
  newPatchedRomDir: string
  newBaseRomDir: string
}

/**
 * Moves every cached patch, patched ROM, and the managed base ROM copy to
 * the new location, and rewrites the paths mod_status and app_config already
 * have on file, so installed mods and the configured ROM keep working
 * without a re-download or re-pick. Call assertWritableDirectory on the new
 * root first - this function assumes the destination is already known-good.
 */
export async function relocateStorage(input: RelocateStorageInput): Promise<void> {
  const {
    db,
    oldPatchCacheDir,
    oldPatchedRomDir,
    oldBaseRomDir,
    newPatchCacheDir,
    newPatchedRomDir,
    newBaseRomDir
  } = input

  if (
    oldPatchCacheDir === newPatchCacheDir &&
    oldPatchedRomDir === newPatchedRomDir &&
    oldBaseRomDir === newBaseRomDir
  ) {
    return
  }

  await moveDirContents(oldPatchCacheDir, newPatchCacheDir)
  await moveDirContents(oldPatchedRomDir, newPatchedRomDir)
  await moveDirContents(oldBaseRomDir, newBaseRomDir)

  const rows = db
    .prepare('SELECT mod_id, patch_file_path, patched_rom_path FROM mod_status')
    .all() as {
    mod_id: string
    patch_file_path: string | null
    patched_rom_path: string | null
  }[]

  const update = db.prepare(
    'UPDATE mod_status SET patch_file_path = @patchFilePath, patched_rom_path = @patchedRomPath WHERE mod_id = @modId'
  )

  const appConfigRow = db.prepare('SELECT rom_path FROM app_config WHERE id = 1').get() as
    { rom_path: string | null } | undefined
  const rebasedRomPath = appConfigRow
    ? rebase(appConfigRow.rom_path, oldBaseRomDir, newBaseRomDir)
    : null

  const rewriteAll = db.transaction(() => {
    for (const row of rows) {
      const patchFilePath = rebase(row.patch_file_path, oldPatchCacheDir, newPatchCacheDir)
      const patchedRomPath = rebase(row.patched_rom_path, oldPatchedRomDir, newPatchedRomDir)
      if (patchFilePath === row.patch_file_path && patchedRomPath === row.patched_rom_path) {
        continue
      }
      update.run({ modId: row.mod_id, patchFilePath, patchedRomPath })
    }

    if (appConfigRow && rebasedRomPath !== appConfigRow.rom_path) {
      db.prepare('UPDATE app_config SET rom_path = ? WHERE id = 1').run(rebasedRomPath)
    }
  })
  rewriteAll()
}
