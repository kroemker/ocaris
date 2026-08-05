import { nativeImage } from 'electron'
import { existsSync } from 'node:fs'
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

/**
 * Cache file extensions, in the order the protocol handler looks for them.
 * 'jpg' is what the resize path writes; the rest are formats stored verbatim
 * (see fetchAndStore).
 */
export const THUMBNAIL_EXTENSIONS = ['jpg', 'webp', 'gif', 'avif'] as const

export function thumbnailBaseName(modId: string): string {
  return modId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? fileName : fileName.slice(0, dot)
}

/** Path of the cached thumbnail for a mod, whatever format it landed in. */
export function findThumbnailFile(dir: string, modId: string): string | null {
  const base = thumbnailBaseName(modId)
  for (const extension of THUMBNAIL_EXTENSIONS) {
    const file = join(dir, `${base}.${extension}`)
    if (existsSync(file)) return file
  }
  return null
}

/**
 * Formats Chromium renders in an <img> but nativeImage cannot decode, matched
 * on their magic bytes. Sniffing the bytes rather than trusting the URL or the
 * Content-Type is what makes this safe: HTML error pages served with a 200,
 * and SVG (which the renderer would execute), match nothing and stay out.
 */
function passthroughExtension(buffer: Buffer): string | null {
  const ascii = (start: number, end: number): string => buffer.toString('latin1', start, end)
  if (buffer.length < 12) return null
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (ascii(0, 4) === 'GIF8') return 'gif'
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'avif'
  return null
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

  if (!image.isEmpty()) {
    const resized =
      image.getSize().width > CACHE_WIDTH ? image.resize({ width: CACHE_WIDTH }) : image
    await writeFile(
      join(dir, `${thumbnailBaseName(request.modId)}.jpg`),
      resized.toJPEG(JPEG_QUALITY)
    )
    return true
  }

  // nativeImage decodes PNG and JPEG only, but a third of the live catalog
  // serves WebP - usually under a .png/.jpg name with a Content-Type to match,
  // so only the bytes give it away. Those images decoded to an empty
  // nativeImage and were dropped, which is why their rows showed placeholders.
  // The renderer is Chromium and displays them fine, so they're stored as
  // served: no resize, but the WebP the catalog ships runs 5-60 KB anyway.
  const passthrough = passthroughExtension(source)
  if (!passthrough) return false

  await writeFile(join(dir, `${thumbnailBaseName(request.modId)}.${passthrough}`), source)
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

  // Matched on the base name, since a cached thumbnail can carry any of the
  // extensions above.
  const existing = new Set((await readdir(dir).catch(() => [])).map(stripExtension))
  const missing = requests.filter((request) => !existing.has(thumbnailBaseName(request.modId)))

  const results = await mapWithConcurrency(missing, CONCURRENCY, (request) =>
    fetchAndStore(dir, request).catch(() => false)
  )

  return results.filter(Boolean).length
}
