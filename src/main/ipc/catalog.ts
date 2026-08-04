import { ipcMain } from 'electron'
import {
  IpcChannel,
  type CatalogRefreshResult,
  type CatalogStats,
  type ModSummary
} from '@shared/ipc'
import { getDatabase } from '../db'
import { getAppConfig } from '../db/appConfig'
import {
  getCatalogStats,
  getModWithStatus,
  listModsWithStatus,
  type ModWithStatus
} from '../db/mods'
import { getPatchCacheDir, getPatchedRomDir } from '../storage/paths'
import { beginInstall, endInstall } from './mods'
import { HylianModdingCatalogSource } from '../catalog/hylianModdingSource'
import { refreshCatalog } from '../catalog/refresh'
import { installMod } from '../mods/install'

interface HylianModMetadata {
  downloadLink: string | null
  thumbnailUrl: string | null
  completionStatus: string | null
}

function toModSummary(mod: ModWithStatus): ModSummary {
  const metadata = (mod.metadata ?? {}) as Partial<HylianModMetadata>
  return {
    id: mod.id,
    source: mod.source,
    name: mod.name,
    author: mod.author,
    description: mod.description,
    thumbnailUrl: metadata.thumbnailUrl ?? null,
    downloadLink: metadata.downloadLink ?? null,
    completionStatus: metadata.completionStatus ?? null,
    status: {
      state: mod.status.state,
      patchedRomPath: mod.status.patchedRomPath,
      downloadProgressBytes: mod.status.downloadProgressBytes,
      downloadTotalBytes: mod.status.downloadTotalBytes,
      errorMessage: mod.status.errorMessage
    }
  }
}

const catalogSource = new HylianModdingCatalogSource()

export function registerCatalogIpcHandlers(): void {
  ipcMain.handle(IpcChannel.CatalogRefresh, async (): Promise<CatalogRefreshResult> => {
    return refreshCatalog(getDatabase(), catalogSource)
  })

  ipcMain.handle(IpcChannel.CatalogList, (): ModSummary[] => {
    return listModsWithStatus(getDatabase()).map(toModSummary)
  })

  ipcMain.handle(IpcChannel.CatalogStats, (): CatalogStats => {
    return getCatalogStats(getDatabase())
  })

  ipcMain.handle(IpcChannel.ModInstall, async (_event, modId: string): Promise<ModSummary> => {
    const db = getDatabase()
    const mod = getModWithStatus(db, modId)
    if (!mod) {
      throw new Error(`Mod ${modId} not found`)
    }

    const metadata = (mod.metadata ?? {}) as Partial<HylianModMetadata>
    if (!metadata.downloadLink) {
      throw new Error(`Mod ${modId} has no download link`)
    }

    const romConfig = getAppConfig(db)
    if (!romConfig.romPath) {
      throw new Error('No ROM configured yet.')
    }

    // Registered so mod:cancel can abort this one download; installMod turns
    // the abort into a 'not_downloaded' status rather than an error.
    const controller = beginInstall(modId)
    try {
      await installMod({
        db,
        modId,
        downloadUrl: metadata.downloadLink,
        romPath: romConfig.romPath,
        patchCacheDir: getPatchCacheDir(db),
        patchedRomDir: getPatchedRomDir(db),
        signal: controller.signal
      })
    } finally {
      endInstall(modId, controller)
    }

    const updated = getModWithStatus(db, modId)
    if (!updated) {
      throw new Error(`Mod ${modId} disappeared during install`)
    }
    return toModSummary(updated)
  })
}
