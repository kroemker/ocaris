import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { applyBpsPatch } from '../../patch/bps'
import { downloadFile, type DownloadProgress } from '../download/downloadFile'
import { setModStatus, type ModStatus } from '../db/mods'
import { classifyDownloadLink, findMatchingPatchInZip } from './resolvePatch'

export interface InstallModInput {
  db: Database.Database
  modId: string
  downloadUrl: string
  romPath: string
  patchCacheDir: string
  patchedRomDir: string
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}

function safeFileStem(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** Sniffs the first bytes for HTML, which no patch or archive starts with. */
async function looksLikeWebPage(path: string): Promise<boolean> {
  const handle = await open(path)
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(64), 0, 64, 0)
    return /^\s*<(?:!doctype|html|\?xml)/i.test(buffer.subarray(0, bytesRead).toString('latin1'))
  } finally {
    await handle.close()
  }
}

/**
 * An aborted fetch surfaces as an AbortError, but a signal that fires between
 * steps (after the download, before the patch) can also surface as an ordinary
 * error, so the signal itself is the more reliable half of this check.
 */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof Error && err.name === 'AbortError'
}

/**
 * Downloads a mod's patch (a bare .bps, or a .zip containing one or more -
 * see docs/catalog-source-spec.md) and applies it to the verified base ROM,
 * updating mod_status through the whole lifecycle. Never rejects - any
 * failure (unsupported download type, download error, or patch mismatch)
 * resolves to an 'error' status with a descriptive message rather than
 * throwing, so callers don't need a try/catch to handle the expected
 * failure modes.
 *
 * Cancelling via `signal` is not a failure: it resolves to 'not_downloaded'
 * with the progress fields cleared, so the mod simply looks uninstalled again.
 */
export async function installMod(input: InstallModInput): Promise<ModStatus> {
  const { db, modId, downloadUrl, romPath, patchCacheDir, patchedRomDir } = input

  const kind = classifyDownloadLink(downloadUrl)
  if (kind === 'unsupported') {
    return setModStatus(db, modId, {
      state: 'error',
      errorMessage:
        'This mod is not automatically installable - download it manually from the mod page.'
    })
  }

  setModStatus(db, modId, {
    state: 'downloading',
    downloadProgressBytes: 0,
    downloadTotalBytes: null,
    errorMessage: null
  })

  const stem = safeFileStem(modId)
  const downloadPath = join(patchCacheDir, kind === 'archive' ? `${stem}.zip` : `${stem}.bps`)
  const patchFilePath = join(patchCacheDir, `${stem}.bps`)
  const patchedRomPath = join(patchedRomDir, `${stem}.z64`)

  try {
    await mkdir(patchCacheDir, { recursive: true })
    await mkdir(patchedRomDir, { recursive: true })

    await downloadFile(downloadUrl, downloadPath, {
      signal: input.signal,
      onProgress: (progress) => {
        setModStatus(db, modId, {
          downloadProgressBytes: progress.bytesDownloaded,
          downloadTotalBytes: progress.totalBytes
        })
        input.onProgress?.(progress)
      }
    })

    // A link can end in .bps or .zip and still hand back a web page: a
    // file-host page that wants a click-through (Dropbox's ?dl=0), or an
    // expired attachment. Saying so beats the "missing BPS1 magic" the patch
    // parser would report a moment later.
    if (await looksLikeWebPage(downloadPath)) {
      return setModStatus(db, modId, {
        state: 'error',
        errorMessage:
          'That link returned a web page rather than a patch file - open the mod page and download it by hand.'
      })
    }

    const source = await readFile(romPath)

    let patch: Buffer
    if (kind === 'archive') {
      const zipBuffer = await readFile(downloadPath)
      patch = findMatchingPatchInZip(zipBuffer, source)
      await writeFile(patchFilePath, patch)
    } else {
      patch = await readFile(downloadPath)
    }

    const patchedRom = applyBpsPatch(source, patch)
    await writeFile(patchedRomPath, patchedRom)

    return setModStatus(db, modId, {
      state: 'ready',
      patchFilePath,
      patchedRomPath,
      errorMessage: null
    })
  } catch (err) {
    // A cancellation is the user's own doing, not a failure: it goes back to
    // 'not_downloaded' with no error message, so the row offers Download again
    // instead of showing a red error for something they asked for.
    if (isAbort(err, input.signal)) {
      return setModStatus(db, modId, {
        state: 'not_downloaded',
        patchFilePath: null,
        patchedRomPath: null,
        downloadProgressBytes: null,
        downloadTotalBytes: null,
        errorMessage: null
      })
    }

    const message = err instanceof Error ? err.message : String(err)
    return setModStatus(db, modId, { state: 'error', errorMessage: message })
  }
}
