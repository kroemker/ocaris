import { dialog, ipcMain, shell } from 'electron'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannel, type StorageUsage } from '@shared/ipc'
import { getDatabase } from '../db'
import { saveStorageRoot } from '../db/appConfig'
import {
  getBaseRomDir,
  getDefaultStorageRoot,
  getPatchCacheDir,
  getPatchedRomDir,
  getStorageRoot
} from '../storage/paths'
import { assertWritableDirectory, relocateStorage } from '../storage/relocate'
import { hasActiveInstalls } from './mods'

async function measure(dir: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0
  let totalBytes = 0

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // Nothing has been patched yet, so the directory doesn't exist.
    return { fileCount, totalBytes }
  }

  for (const entry of entries) {
    const stats = await stat(join(dir, entry)).catch(() => null)
    if (!stats?.isFile()) continue
    fileCount += 1
    totalBytes += stats.size
  }

  return { fileCount, totalBytes }
}

async function buildUsage(): Promise<StorageUsage> {
  const db = getDatabase()
  const storageRoot = getStorageRoot(db)
  const patchedRomDir = getPatchedRomDir(db)
  return {
    storageRoot,
    isDefaultLocation: storageRoot === getDefaultStorageRoot(),
    patchedRomDir,
    ...(await measure(patchedRomDir))
  }
}

export function registerStorageIpcHandlers(): void {
  ipcMain.handle(IpcChannel.StorageUsage, (): Promise<StorageUsage> => buildUsage())

  // Takes no path from the renderer: the only directory it can open is the
  // app's own patched-ROM directory, resolved here.
  ipcMain.handle(IpcChannel.StorageOpenFolder, async (): Promise<void> => {
    const dir = getPatchedRomDir(getDatabase())
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle(IpcChannel.StorageSelectFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a folder for patches and patched ROMs',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // A null path resets to the default userData location.
  ipcMain.handle(
    IpcChannel.StorageSetLocation,
    async (_event, path: unknown): Promise<StorageUsage> => {
      if (path !== null && typeof path !== 'string') {
        throw new Error('Storage location must be a folder path or null.')
      }
      if (hasActiveInstalls()) {
        throw new Error('Wait for downloads in progress to finish before changing the location.')
      }

      const db = getDatabase()
      const oldPatchCacheDir = getPatchCacheDir(db)
      const oldPatchedRomDir = getPatchedRomDir(db)
      const oldBaseRomDir = getBaseRomDir(db)

      const newRoot = path ?? getDefaultStorageRoot()
      await assertWritableDirectory(newRoot)

      await relocateStorage({
        db,
        oldPatchCacheDir,
        oldPatchedRomDir,
        oldBaseRomDir,
        newPatchCacheDir: join(newRoot, 'patches'),
        newPatchedRomDir: join(newRoot, 'roms'),
        newBaseRomDir: join(newRoot, 'base')
      })

      saveStorageRoot(db, path)
      return buildUsage()
    }
  )
}
