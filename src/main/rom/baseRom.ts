import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** Fixed name so re-confirming a ROM overwrites the previous copy in place
 *  rather than accumulating one file per variant/extension picked over time. */
export const BASE_ROM_FILE_NAME = 'base.z64'

export function baseRomPath(baseRomDir: string): string {
  return join(baseRomDir, BASE_ROM_FILE_NAME)
}

/**
 * Copies the user's chosen ROM into Ocaris's own storage, so patching keeps
 * working even if the original file is later moved, renamed, or deleted -
 * every install reads from this managed copy, never the picked path.
 *
 * Writes to a `.part` sibling first and renames on success, same as
 * download/downloadFile.ts, so a crash mid-copy can't leave a truncated base
 * ROM sitting at the destination path.
 *
 * Returns the managed copy's path. If `sourcePath` already *is* the managed
 * copy - re-picking it from the file dialog after browsing into Ocaris's own
 * storage folder - the copy is skipped, since copying a file onto itself can
 * truncate it on some platforms.
 */
export async function copyBaseRom(sourcePath: string, baseRomDir: string): Promise<string> {
  const destPath = baseRomPath(baseRomDir)
  if (sourcePath === destPath) return destPath

  await mkdir(baseRomDir, { recursive: true })
  const tempPath = `${destPath}.part`
  try {
    await copyFile(sourcePath, tempPath)
    await rename(tempPath, destPath)
  } catch (err) {
    await rm(tempPath, { force: true })
    throw err
  }
  return destPath
}
