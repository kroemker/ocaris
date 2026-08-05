import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { findThumbnailFile } from './cache'

export const THUMBNAIL_SCHEME = 'ocaris-thumb'

/** URL the renderer puts in an <img src>. */
export function thumbnailUrl(modId: string): string {
  return `${THUMBNAIL_SCHEME}://mod/${encodeURIComponent(modId)}`
}

/**
 * Must run before app 'ready'. Registering the scheme as standard gives it
 * normal URL parsing; it is not given fetch access or the ability to bypass
 * CSP, since all it ever does is hand back a local image.
 */
export function registerThumbnailScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: THUMBNAIL_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

export function registerThumbnailProtocol(dir: string): void {
  protocol.handle(THUMBNAIL_SCHEME, (request) => {
    // The mod id is the only thing taken from the URL, and thumbnailBaseName
    // strips everything outside [A-Za-z0-9_-], so no path traversal survives.
    // The extension comes from the cache's own fixed list, never from the URL.
    const modId = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    const file = modId ? findThumbnailFile(dir, modId) : null

    // A mod whose thumbnail isn't cached (or failed to download) 404s, and the
    // row falls back to its placeholder tile.
    if (!file) {
      return Promise.resolve(new Response(null, { status: 404 }))
    }

    return net.fetch(pathToFileURL(file).toString())
  })
}
