import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { applyBpsPatch } from '../../patch/bps'
import { downloadFile, type DownloadProgress } from '../download/downloadFile'
import { setModStatus, type ModStatus } from '../db/mods'

export interface InstallModInput {
  db: Database.Database
  modId: string
  patchUrl: string
  romPath: string
  patchCacheDir: string
  patchedRomDir: string
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}

function safeFileStem(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Downloads a mod's patch file and applies it to the verified base ROM,
 * updating mod_status through the whole lifecycle. Never rejects - any
 * failure (download or patch) resolves to an 'error' status with a
 * descriptive message rather than throwing, so callers don't need a
 * try/catch to handle the expected failure modes.
 */
export async function installMod(input: InstallModInput): Promise<ModStatus> {
  const { db, modId, patchUrl, romPath, patchCacheDir, patchedRomDir } = input

  setModStatus(db, modId, {
    state: 'downloading',
    downloadProgressBytes: 0,
    downloadTotalBytes: null,
    errorMessage: null
  })

  const stem = safeFileStem(modId)
  const patchFilePath = join(patchCacheDir, `${stem}.bps`)
  const patchedRomPath = join(patchedRomDir, `${stem}.z64`)

  try {
    await mkdir(patchCacheDir, { recursive: true })
    await mkdir(patchedRomDir, { recursive: true })

    await downloadFile(patchUrl, patchFilePath, {
      signal: input.signal,
      onProgress: (progress) => {
        setModStatus(db, modId, {
          downloadProgressBytes: progress.bytesDownloaded,
          downloadTotalBytes: progress.totalBytes
        })
        input.onProgress?.(progress)
      }
    })

    const [source, patch] = await Promise.all([readFile(romPath), readFile(patchFilePath)])
    const patchedRom = applyBpsPatch(source, patch)
    await writeFile(patchedRomPath, patchedRom)

    return setModStatus(db, modId, {
      state: 'ready',
      patchFilePath,
      patchedRomPath,
      errorMessage: null
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return setModStatus(db, modId, { state: 'error', errorMessage: message })
  }
}
