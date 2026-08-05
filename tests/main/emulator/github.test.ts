import { createServer, type RequestListener, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  fetchLatestReleaseAssets,
  GithubReleaseError,
  pickAsset
} from '../../../src/main/emulator/github'

let server: Server

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

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

describe('fetchLatestReleaseAssets', () => {
  it('parses the assets array of the latest release', async () => {
    const baseUrl = await startServer((req, res) => {
      expect(req.url).toBe('/repos/someone/somerepo/releases/latest')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          assets: [
            {
              name: 'app-windows.zip',
              browser_download_url: 'https://example.com/app-windows.zip'
            },
            { name: 'app-linux.zip', browser_download_url: 'https://example.com/app-linux.zip' }
          ]
        })
      )
    })

    const assets = await fetchLatestReleaseAssets('someone/somerepo', undefined, baseUrl)

    expect(assets).toEqual([
      { name: 'app-windows.zip', downloadUrl: 'https://example.com/app-windows.zip' },
      { name: 'app-linux.zip', downloadUrl: 'https://example.com/app-linux.zip' }
    ])
  })

  it('throws GithubReleaseError on a non-2xx response', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(404)
      res.end('not found')
    })

    await expect(fetchLatestReleaseAssets('someone/somerepo', undefined, baseUrl)).rejects.toThrow(
      GithubReleaseError
    )
  })
})

describe('pickAsset', () => {
  const assets = [
    { name: 'app-1.2.3-windows-x64.zip', downloadUrl: 'https://example.com/win' },
    { name: 'app-1.2.3-linux-x86_64.AppImage', downloadUrl: 'https://example.com/linux' },
    { name: 'app-1.2.3-macos.zip', downloadUrl: 'https://example.com/mac' }
  ]

  it('returns the first asset whose name matches the pattern', () => {
    expect(pickAsset(assets, /linux.*\.appimage$/i)).toEqual(assets[1])
  })

  it('returns undefined when nothing matches', () => {
    expect(pickAsset(assets, /freebsd/i)).toBeUndefined()
  })
})
