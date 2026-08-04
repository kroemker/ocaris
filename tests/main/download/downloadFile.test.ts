import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { downloadFile, DownloadError } from '../../../src/main/download/downloadFile'

let server: Server
let baseUrl: string
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-download-'))
})

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

describe('downloadFile', () => {
  it('downloads a file and reports final progress matching content-length', async () => {
    const body = Buffer.from('hello from the test server, this is the patch file content')
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(body.length) })
      res.end(body)
    })

    const progressEvents: { bytesDownloaded: number; totalBytes: number | null }[] = []
    const destPath = join(dir, 'out.bin')

    await downloadFile(`${baseUrl}/file`, destPath, {
      onProgress: (p) => progressEvents.push(p)
    })

    expect(readFileSync(destPath)).toEqual(body)
    expect(progressEvents.at(-1)).toEqual({ bytesDownloaded: body.length, totalBytes: body.length })
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })

  it('reports totalBytes as null when the server omits content-length', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200)
      res.end('no content-length here')
    })

    const progressEvents: { bytesDownloaded: number; totalBytes: number | null }[] = []
    await downloadFile(`${baseUrl}/file`, join(dir, 'out.bin'), {
      onProgress: (p) => progressEvents.push(p)
    })

    expect(progressEvents.every((p) => p.totalBytes === null)).toBe(true)
  })

  it('rejects with DownloadError on a non-2xx response and leaves no files behind', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(404)
      res.end('not found')
    })

    const destPath = join(dir, 'out.bin')
    await expect(downloadFile(`${baseUrl}/missing`, destPath)).rejects.toThrow(DownloadError)

    expect(existsSync(destPath)).toBe(false)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })

  it('cleans up the partial file when the server aborts mid-response', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '1000000' })
      res.write(Buffer.alloc(1024, 1))
      setTimeout(() => res.destroy(), 20)
    })

    const destPath = join(dir, 'out.bin')
    await expect(downloadFile(`${baseUrl}/flaky`, destPath)).rejects.toThrow(DownloadError)

    expect(existsSync(destPath)).toBe(false)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })

  it('supports cancellation via AbortSignal and cleans up', async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200)
      const interval = setInterval(() => {
        if (!res.write(Buffer.alloc(1024, 2))) {
          // backpressure is fine, keep trying
        }
      }, 5)
      res.on('close', () => clearInterval(interval))
    })

    const controller = new AbortController()
    const destPath = join(dir, 'out.bin')

    const promise = downloadFile(`${baseUrl}/slow`, destPath, { signal: controller.signal })
    setTimeout(() => controller.abort(), 30)

    await expect(promise).rejects.toThrow(DownloadError)
    expect(existsSync(destPath)).toBe(false)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })
})
