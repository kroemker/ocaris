import { nativeImage } from 'electron'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapWithConcurrency } from '../catalog/concurrency'

/**
 * The catalog links full screenshots, not thumbnails - measured against the
 * live source, they run up to 1280x720 and 555 KB each, roughly 8 MB across
 * the catalog. The row renders them in a 104px box, so they're downscaled on
 * the way into the cache.
 *
 * 312px is 3x the box, enough for any display scaling, and nativeImage ships
 * with Electron so this needs no image dependency and no native build.
 */
const CACHE_WIDTH = 312
const JPEG_QUALITY = 82

/** Modest cap: this runs in the background after a refresh and shouldn't
 *  compete with whatever the user asked for. */
const CONCURRENCY = 4

export function thumbnailFileName(modId: string): string {
  return `${modId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`
}

export interface ThumbnailRequest {
  modId: string
  url: string
}

async function fetchAndStore(dir: string, request: ThumbnailRequest): Promise<boolean> {
  const response = await fetch(request.url)
  if (!response.ok) return false

  const source = Buffer.from(await response.arrayBuffer())
  const image = nativeImage.createFromBuffer(source)
  // Anything nativeImage can't decode (an SVG, an HTML error page served with
  // a 200) comes back empty rather than throwing.
  if (image.isEmpty()) return false

  const resized = image.getSize().width > CACHE_WIDTH ? image.resize({ width: CACHE_WIDTH }) : image

  await writeFile(join(dir, thumbnailFileName(request.modId)), resized.toJPEG(JPEG_QUALITY))
  return true
}

/**
 * Downloads and caches any thumbnail not already on disk. Failures are per
 * thumbnail and never propagate: a missing image falls back to the row's
 * placeholder tile, which is not worth failing a catalog refresh over.
 */
export async function cacheThumbnails(
  dir: string,
  requests: readonly ThumbnailRequest[]
): Promise<number> {
  await mkdir(dir, { recursive: true })

  const existing = new Set(await readdir(dir).catch(() => []))
  const missing = requests.filter((request) => !existing.has(thumbnailFileName(request.modId)))

  const results = await mapWithConcurrency(missing, CONCURRENCY, (request) =>
    fetchAndStore(dir, request).catch(() => false)
  )

  return results.filter(Boolean).length
}
