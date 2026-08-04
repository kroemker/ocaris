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

const { cacheThumbnails, thumbnailFileName } = await import('../../../src/main/thumbnails/cache')

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
    expect(existsSync(join(dir, thumbnailFileName('src:one')))).toBe(true)
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
    expect(readFileSync(join(dir, thumbnailFileName('small'))).toString()).toBe('jpeg@200')
  })

  it('skips thumbnails that are already cached', async () => {
    let requests = 0
    const baseUrl = await startServer((_req, res) => {
      requests += 1
      res.writeHead(200)
      res.end(fakeImage(640))
    })

    writeFileSync(join(dir, thumbnailFileName('cached')), 'existing')

    const stored = await cacheThumbnails(dir, [{ modId: 'cached', url: `${baseUrl}/c.png` }])

    expect(requests).toBe(0)
    expect(stored).toBe(0)
    expect(readFileSync(join(dir, thumbnailFileName('cached'))).toString()).toBe('existing')
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
    expect(existsSync(join(dir, thumbnailFileName('good')))).toBe(true)
    expect(existsSync(join(dir, thumbnailFileName('missing')))).toBe(false)
    expect(existsSync(join(dir, thumbnailFileName('garbage')))).toBe(false)
  })

  it('sanitises the mod id into the cache file name', () => {
    expect(thumbnailFileName('hylianmodding:the_missing_link')).toBe(
      'hylianmodding_the_missing_link.jpg'
    )
    expect(thumbnailFileName('../../etc/passwd')).toBe('______etc_passwd.jpg')
  })
})
