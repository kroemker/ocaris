import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import {
  IpcChannel,
  type CatalogRefreshResult,
  type CatalogStats,
  type ModProgressEvent,
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
import { getPatchCacheDir, getPatchedRomDir, getThumbnailDir } from '../storage/paths'
import { cacheThumbnails, type ThumbnailRequest } from '../thumbnails/cache'
import { thumbnailUrl } from '../thumbnails/protocol'
import { beginInstall, endInstall } from './mods'
import { HylianModdingCatalogSource } from '../catalog/hylianModdingSource'
import { ZeldaFandomCatalogSource } from '../catalog/zeldaFandomSource'
import { refreshCatalog } from '../catalog/refresh'
import type { CatalogMetadata } from '../catalog/types'
import { classifyDownloadLink } from '../mods/resolvePatch'
import { installMod } from '../mods/install'
import { PROGRESS_EMIT_INTERVAL_MS, throttle } from '../util/throttle'
import type { DownloadProgress } from '../download/downloadFile'

function toModSummary(mod: ModWithStatus): ModSummary {
  const metadata = (mod.metadata ?? {}) as Partial<CatalogMetadata>
  const downloadLink = metadata.downloadLink ?? null
  return {
    id: mod.id,
    source: mod.source,
    name: mod.name,
    author: mod.author,
    description: mod.description,
    // The renderer is pointed at the local cache, never at the source: a mod
    // with an upstream image but no cached copy yet 404s and falls back to the
    // placeholder tile.
    thumbnailUrl: metadata.thumbnailUrl ? thumbnailUrl(mod.id) : null,
    downloadLink,
    installable: downloadLink !== null && classifyDownloadLink(downloadLink) !== 'unsupported',
    pageUrl: metadata.pageUrl ?? null,
    completionStatus: metadata.completionStatus ?? null,
    // Rows written before merging existed carry no source list; the row they
    // came from is still one source.
    sources: metadata.sources?.map(({ source, pageUrl }) => ({ source, pageUrl })) ?? [
      { source: mod.source, pageUrl: metadata.pageUrl ?? null }
    ],
    firstSeenAt: mod.firstSeenAt,
    prefs: mod.prefs,
    status: {
      state: mod.status.state,
      patchedRomPath: mod.status.patchedRomPath,
      downloadProgressBytes: mod.status.downloadProgressBytes,
      downloadTotalBytes: mod.status.downloadTotalBytes,
      errorMessage: mod.status.errorMessage
    }
  }
}

/**
 * Priority order, which is also merge order: hylianmodding.com first because
 * it hosts real patch files, then the wiki for everything it doesn't cover.
 */
const catalogSources = [new HylianModdingCatalogSource(), new ZeldaFandomCatalogSource()]

/** Every mod that advertises an upstream thumbnail, for the cache to fill in. */
function collectThumbnailRequests(db: Database.Database): ThumbnailRequest[] {
  return listModsWithStatus(db).flatMap((mod) => {
    const metadata = (mod.metadata ?? {}) as Partial<CatalogMetadata>
    return metadata.thumbnailUrl ? [{ modId: mod.id, url: metadata.thumbnailUrl }] : []
  })
}

export function registerCatalogIpcHandlers(): void {
  ipcMain.handle(IpcChannel.CatalogRefresh, async (): Promise<CatalogRefreshResult> => {
    const db = getDatabase()
    const result = await refreshCatalog(db, catalogSources)

    // Awaited rather than backgrounded: the refresh already takes seconds, and
    // finishing with rows that still show placeholders looks broken. Only
    // thumbnails missing from the cache are fetched, so repeat refreshes are
    // effectively free.
    await cacheThumbnails(getThumbnailDir(), collectThumbnailRequests(db))

    return result
  })

  ipcMain.handle(IpcChannel.CatalogList, (): ModSummary[] => {
    return listModsWithStatus(getDatabase()).map(toModSummary)
  })

  ipcMain.handle(IpcChannel.CatalogStats, (): CatalogStats => {
    return getCatalogStats(getDatabase())
  })

  ipcMain.handle(IpcChannel.ModInstall, async (event, modId: string): Promise<ModSummary> => {
    const db = getDatabase()
    const mod = getModWithStatus(db, modId)
    if (!mod) {
      throw new Error(`Mod ${modId} not found`)
    }

    const metadata = (mod.metadata ?? {}) as Partial<CatalogMetadata>
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
    const emitProgress = throttle<DownloadProgress>((progress) => {
      // The window can be gone before a long download finishes.
      if (event.sender.isDestroyed()) return
      event.sender.send(IpcChannel.ModProgress, {
        modId,
        downloadProgressBytes: progress.bytesDownloaded,
        downloadTotalBytes: progress.totalBytes
      } satisfies ModProgressEvent)
    }, PROGRESS_EMIT_INTERVAL_MS)

    try {
      await installMod({
        db,
        modId,
        downloadUrl: metadata.downloadLink,
        romPath: romConfig.romPath,
        patchCacheDir: getPatchCacheDir(db),
        patchedRomDir: getPatchedRomDir(db),
        onProgress: emitProgress,
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
