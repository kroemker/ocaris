import { ipcMain, shell } from 'electron'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannel, type StorageUsage } from '@shared/ipc'
import { getDatabase } from '../db'
import { getPatchedRomDir } from '../storage/paths'

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

export function registerStorageIpcHandlers(): void {
  ipcMain.handle(IpcChannel.StorageUsage, async (): Promise<StorageUsage> => {
    const patchedRomDir = getPatchedRomDir(getDatabase())
    return { patchedRomDir, ...(await measure(patchedRomDir)) }
  })

  // Takes no path from the renderer: the only directory it can open is the
  // app's own patched-ROM directory, resolved here.
  ipcMain.handle(IpcChannel.StorageOpenFolder, async (): Promise<void> => {
    const dir = getPatchedRomDir(getDatabase())
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
