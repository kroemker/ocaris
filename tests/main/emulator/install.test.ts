import AdmZip from 'adm-zip'
import { createServer, type RequestListener, type Server } from 'node:http'
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installKnownEmulator } from '../../../src/main/emulator/install'

let server: Server
let dir: string
let baseUrl: string

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

/**
 * Fake GitHub API + file host in one server: serves the release JSON at the
 * real /repos/{repo}/releases/latest path GithubReleaseError expects, and
 * whatever asset bodies are registered under /download/<name>.
 */
function releaseFixtureServer(repo: string, assetName: string, assetBody: Buffer): RequestListener {
  return (req, res) => {
    if (req.url === `/repos/${repo}/releases/latest`) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          assets: [{ name: assetName, browser_download_url: `${baseUrl}/download/${assetName}` }]
        })
      )
      return
    }
    if (req.url === `/download/${assetName}`) {
      res.writeHead(200, { 'content-length': String(assetBody.length) })
      res.end(assetBody)
      return
    }
    res.writeHead(404)
    res.end('not found')
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-emu-install-'))
})

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

describe('installKnownEmulator', () => {
  it('downloads and extracts a zip release, locating the executable inside', async () => {
    const zip = new AdmZip()
    zip.addFile('ares', Buffer.from('#!/bin/sh\necho hi\n'))
    zip.addFile('README.txt', Buffer.from('read me'))
    const zipBuffer = zip.toBuffer()

    baseUrl = await startServer(
      releaseFixtureServer('ares-emulator/ares', 'ares-v148-linux.zip', zipBuffer)
    )

    const result = await installKnownEmulator({
      knownId: 'ares',
      platform: 'linux',
      installDir: dir,
      githubApiBaseUrl: baseUrl
    })

    expect(result.ok).toBe(true)
    expect(result.errorMessage).toBeNull()
    expect(result.executablePath).toBe(join(dir, 'ares', 'ares'))
    expect(existsSync(result.executablePath as string)).toBe(true)

    // chmod +x must have been applied on a POSIX platform.
    const mode = statSync(result.executablePath as string).mode
    expect(mode & 0o111).not.toBe(0)

    // the downloaded zip itself is cleaned up, only extracted contents remain
    expect(readdirSync(join(dir, 'ares')).sort()).toEqual(['README.txt', 'ares'])
  })

  it('saves a raw (non-archive) asset like an AppImage directly and marks it executable', async () => {
    const appImageBody = Buffer.from('fake appimage bytes')
    baseUrl = await startServer(
      releaseFixtureServer('simple64/simple64', 'simple64-gui-linux.AppImage', appImageBody)
    )

    const result = await installKnownEmulator({
      knownId: 'simple64',
      platform: 'linux',
      installDir: dir,
      githubApiBaseUrl: baseUrl
    })

    expect(result.ok).toBe(true)
    expect(result.executablePath).toBe(join(dir, 'simple64', 'simple64-gui-linux.AppImage'))
    const mode = statSync(result.executablePath as string).mode
    expect(mode & 0o111).not.toBe(0)
  })

  it('resolves to an error when no release asset matches the platform pattern', async () => {
    baseUrl = await startServer(
      releaseFixtureServer('ares-emulator/ares', 'ares-v148-windows.zip', Buffer.from('irrelevant'))
    )

    const result = await installKnownEmulator({
      knownId: 'ares',
      platform: 'linux',
      installDir: dir,
      githubApiBaseUrl: baseUrl
    })

    expect(result.ok).toBe(false)
    expect(result.executablePath).toBeNull()
    expect(result.errorMessage).toMatch(/couldn't find a matching download/i)
  })

  it('resolves to an error for an emulator with no download source at all, without touching the network', async () => {
    const result = await installKnownEmulator({
      knownId: 'project64',
      platform: 'win32',
      installDir: dir,
      githubApiBaseUrl: 'http://127.0.0.1:1' // would fail to connect if it were ever hit
    })

    expect(result.ok).toBe(false)
    expect(result.errorMessage).toMatch(/isn't automatically installable/i)
  })

  it('resolves to an error (does not throw) when the archive has no matching executable inside', async () => {
    const zip = new AdmZip()
    zip.addFile('README.txt', Buffer.from('no binary in here'))
    const zipBuffer = zip.toBuffer()

    baseUrl = await startServer(
      releaseFixtureServer('ares-emulator/ares', 'ares-v148-linux.zip', zipBuffer)
    )

    const result = await installKnownEmulator({
      knownId: 'ares',
      platform: 'linux',
      installDir: dir,
      githubApiBaseUrl: baseUrl
    })

    expect(result.ok).toBe(false)
    expect(result.errorMessage).toMatch(/couldn't find its executable/i)
  })

  it('resolves a cancelled install to ok:false with no error message and no leftover files', async () => {
    const controller = new AbortController()

    baseUrl = await startServer((req, res) => {
      if (req.url === '/repos/ares-emulator/ares/releases/latest') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            assets: [
              { name: 'ares-v148-linux.zip', browser_download_url: `${baseUrl}/download/asset.zip` }
            ]
          })
        )
        return
      }
      // Announce a body far larger than what's sent, then stall: the download
      // is still in flight when the abort lands.
      res.writeHead(200, { 'content-length': '100000' })
      res.write(Buffer.alloc(16))
      controller.abort()
    })

    const result = await installKnownEmulator({
      knownId: 'ares',
      platform: 'linux',
      installDir: dir,
      githubApiBaseUrl: baseUrl,
      signal: controller.signal
    })

    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBeNull()
    expect(existsSync(join(dir, 'ares'))).toBe(false)
  })
})
