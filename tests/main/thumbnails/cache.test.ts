import { createServer, type RequestListener, type Server } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * nativeImage comes from Electron, which isn't available in a plain Node test
 * run, so it's stubbed with just enough behaviour to exercise the cache's own
 * logic: an image that decodes, one that doesn't, and the downscale decision.
 */
const resize = vi.fn()

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: (buffer: Buffer) => {
      const decodable = buffer.subarray(0, 4).toString() === 'IMG:'
      const width = decodable ? Number(buffer.subarray(4, 8).toString()) : 0
      const image = {
        isEmpty: () => !decodable,
        getSize: () => ({ width, height: Math.round(width * 0.75) }),
        resize: (options: { width: number }) => {
          resize(options)
          return { ...image, toJPEG: () => Buffer.from(`jpeg@${options.width}`) }
        },
        toJPEG: () => Buffer.from(`jpeg@${width}`)
      }
      return image
    }
  }
}))

const { cacheThumbnails, findThumbnailFile, thumbnailBaseName } =
  await import('../../../src/main/thumbnails/cache')

function jpegPath(modId: string): string {
  return join(dir, `${thumbnailBaseName(modId)}.jpg`)
}

let server: Server
let dir: string

function startServer(handler: RequestListener): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve(`http://127.0.0.1:${address.port}`)
      }
    })
  })
}

/** Header the stubbed decoder understands: 'IMG:' plus a 4-digit width. */
function fakeImage(width: number): Buffer {
  return Buffer.concat([
    Buffer.from('IMG:'),
    Buffer.from(String(width).padStart(4, '0')),
    Buffer.alloc(64)
  ])
}

/** Real WebP magic bytes - nativeImage can't decode these, so they must be
 *  sniffed and stored verbatim. */
function fakeWebp(): Buffer {
  return Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBPVP8 '),
    Buffer.from('webp-payload')
  ])
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-thumbs-'))
  resize.mockClear()
})

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

describe('cacheThumbnails', () => {
  it('downloads, downscales and stores each thumbnail', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(fakeImage(1280))
    })

    const stored = await cacheThumbnails(dir, [
      { modId: 'src:one', url: `${baseUrl}/a.png` },
      { modId: 'src:two', url: `${baseUrl}/b.png` }
    ])

    expect(stored).toBe(2)
    expect(existsSync(jpegPath('src:one'))).toBe(true)
    // 3x the 104px row box, so it stays sharp on a scaled display.
    expect(resize).toHaveBeenCalledWith({ width: 312 })
  })

  it('leaves images smaller than the cache width alone', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200)
      res.end(fakeImage(200))
    })

    await cacheThumbnails(dir, [{ modId: 'small', url: `${baseUrl}/s.png` }])

    expect(resize).not.toHaveBeenCalled()
    expect(readFileSync(jpegPath('small')).toString()).toBe('jpeg@200')
  })

  /**
   * A third of the live catalog serves WebP, much of it under a .png/.jpg name
   * with a matching Content-Type, so the format is only visible in the bytes.
   */
  it('stores formats nativeImage cannot decode verbatim', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(fakeWebp())
    })

    const stored = await cacheThumbnails(dir, [{ modId: 'webp', url: `${baseUrl}/lies.png` }])

    expect(stored).toBe(1)
    expect(resize).not.toHaveBeenCalled()
    const file = join(dir, `${thumbnailBaseName('webp')}.webp`)
    expect(readFileSync(file)).toEqual(fakeWebp())
  })

  it('does not re-download a thumbnail cached under another format', async () => {
    let requests = 0
    const baseUrl = await startServer((_req, res) => {
      requests += 1
      res.writeHead(200)
      res.end(fakeWebp())
    })

    writeFileSync(join(dir, `${thumbnailBaseName('cached')}.webp`), 'existing')

    expect(await cacheThumbnails(dir, [{ modId: 'cached', url: `${baseUrl}/c.png` }])).toBe(0)
    expect(requests).toBe(0)
  })

  it('skips thumbnails that are already cached', async () => {
    let requests = 0
    const baseUrl = await startServer((_req, res) => {
      requests += 1
      res.writeHead(200)
      res.end(fakeImage(640))
    })

    writeFileSync(jpegPath('cached'), 'existing')

    const stored = await cacheThumbnails(dir, [{ modId: 'cached', url: `${baseUrl}/c.png` }])

    expect(requests).toBe(0)
    expect(stored).toBe(0)
    expect(readFileSync(jpegPath('cached')).toString()).toBe('existing')
  })

  it('keeps going when one thumbnail fails or is undecodable', async () => {
    const baseUrl = await startServer((req, res) => {
      if (req.url?.includes('missing')) {
        res.writeHead(404)
        res.end('nope')
        return
      }
      if (req.url?.includes('garbage')) {
        res.writeHead(200)
        res.end(Buffer.from('<html>not an image</html>'))
        return
      }
      res.writeHead(200)
      res.end(fakeImage(640))
    })

    const stored = await cacheThumbnails(dir, [
      { modId: 'missing', url: `${baseUrl}/missing.png` },
      { modId: 'garbage', url: `${baseUrl}/garbage.png` },
      { modId: 'good', url: `${baseUrl}/good.png` }
    ])

    // A thumbnail is decoration; one bad image must not fail a refresh.
    expect(stored).toBe(1)
    expect(existsSync(jpegPath('good'))).toBe(true)
    expect(existsSync(jpegPath('missing'))).toBe(false)
    // HTML matches no passthrough signature, so it never reaches the cache.
    expect(findThumbnailFile(dir, 'garbage')).toBeNull()
  })

  it('sanitises the mod id into the cache file name', () => {
    expect(thumbnailBaseName('hylianmodding:the_missing_link')).toBe(
      'hylianmodding_the_missing_link'
    )
    expect(thumbnailBaseName('../../etc/passwd')).toBe('______etc_passwd')
  })

  it('finds a cached thumbnail whatever format it landed in', () => {
    writeFileSync(join(dir, `${thumbnailBaseName('a:b')}.webp`), 'x')

    expect(findThumbnailFile(dir, 'a:b')).toBe(join(dir, 'a_b.webp'))
    expect(findThumbnailFile(dir, 'nothing')).toBeNull()
  })
})
