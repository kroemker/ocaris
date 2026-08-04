import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { PassThrough, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export class DownloadError extends Error {}

export interface DownloadProgress {
  bytesDownloaded: number
  totalBytes: number | null
}

export interface DownloadFileOptions {
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
}

/**
 * Streams `url` to `destPath`, writing to a `.part` sibling file first and
 * renaming on success so a failed/cancelled download never leaves a partial
 * file at the destination path that could be mistaken for a complete one.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadFileOptions = {}
): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, { signal: options.signal })
  } catch (err) {
    if (options.signal?.aborted) {
      throw new DownloadError('Download cancelled.')
    }
    throw new DownloadError(`Failed to reach ${url}: ${(err as Error).message}`)
  }

  if (!response.ok || !response.body) {
    throw new DownloadError(`Failed to download ${url}: HTTP ${response.status}`)
  }

  const contentLength = response.headers.get('content-length')
  const totalBytes = contentLength ? Number(contentLength) : null

  const tempPath = `${destPath}.part`
  let bytesDownloaded = 0
  const progressTracker = new PassThrough()
  progressTracker.on('data', (chunk: Buffer) => {
    bytesDownloaded += chunk.length
    options.onProgress?.({ bytesDownloaded, totalBytes })
  })

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      progressTracker,
      createWriteStream(tempPath),
      { signal: options.signal }
    )
    await rename(tempPath, destPath)
  } catch (err) {
    await rm(tempPath, { force: true })
    if (options.signal?.aborted) {
      throw new DownloadError('Download cancelled.')
    }
    throw err instanceof DownloadError
      ? err
      : new DownloadError(`Download failed: ${(err as Error).message}`)
  }
}
