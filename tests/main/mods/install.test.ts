import AdmZip from 'adm-zip'
import { createServer, type RequestListener, type Server } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../../../src/main/db/migrations'
import { getModWithStatus, listModsWithStatus, upsertMods } from '../../../src/main/db/mods'
import { installMod } from '../../../src/main/mods/install'
import { crc32 } from '../../../src/patch/crc32'

// Same minimal BPS encoder as tests/patch/bps.test.ts, kept local since it's
// only used to build fixtures for these tests.
function encodeNumber(value: number): number[] {
  const bytes: number[] = []
  let data = value
  for (;;) {
    const x = data & 0x7f
    data >>>= 7
    if (data === 0) {
      bytes.push(0x80 | x)
      break
    }
    bytes.push(x)
    data -= 1
  }
  return bytes
}

function uint32le(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value, 0)
  return buf
}

function buildBpsPatch(source: Buffer, target: Buffer): Buffer {
  const action = encodeNumber(((target.length - 1) << 2) | 1) // TargetRead, whole target
  const body = Buffer.from([
    ...Buffer.from('BPS1', 'ascii'),
    ...encodeNumber(source.length),
    ...encodeNumber(target.length),
    ...encodeNumber(0),
    ...action,
    ...target
  ])
  const withoutPatchCrc = Buffer.concat([body, uint32le(crc32(source)), uint32le(crc32(target))])
  return Buffer.concat([withoutPatchCrc, uint32le(crc32(withoutPatchCrc))])
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-install-'))
})

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

function createDbWithMod(): { db: Database.Database; modId: string } {
  const db = new Database(':memory:')
  runMigrations(db)
  upsertMods(db, [
    {
      source: 'test',
      sourceId: '1',
      name: 'Test Mod',
      author: null,
      description: null,
      metadata: null
    }
  ])
  const [mod] = listModsWithStatus(db)
  return { db, modId: mod.id }
}

describe('installMod', () => {
  it('downloads and applies a bare .bps patch, producing a ready mod with an unchanged source ROM', async () => {
    const source = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched romantic content here', 'ascii')
    const patch = buildBpsPatch(source, target)

    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, source)
    const sourceBeforeInstall = Buffer.from(readFileSync(romPath))

    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(patch.length) })
      res.end(patch)
    })

    const { db, modId } = createDbWithMod()
    const progressEvents: unknown[] = []

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/patch.bps`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms'),
      onProgress: (p) => progressEvents.push(p)
    })

    expect(status.state).toBe('ready')
    expect(status.patchedRomPath).toBeTruthy()
    expect(readFileSync(status.patchedRomPath as string)).toEqual(target)
    expect(progressEvents.length).toBeGreaterThan(0)

    // Source ROM must never be modified in place.
    expect(readFileSync(romPath)).toEqual(sourceBeforeInstall)

    const persisted = getModWithStatus(db, modId)
    expect(persisted?.status.state).toBe('ready')

    db.close()
  })

  it('downloads a .zip, picks the matching patch by embedded source CRC, and applies it', async () => {
    const source = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const otherSource = Buffer.from('ZZZZZBBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched from inside a zip', 'ascii')
    const otherTarget = Buffer.from('wrong-version target', 'ascii')

    const zip = new AdmZip()
    zip.addFile('game_U_1.1.bps', buildBpsPatch(otherSource, otherTarget))
    zip.addFile('game_U_1.0.bps', buildBpsPatch(source, target))
    const zipBuffer = zip.toBuffer()

    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, source)

    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(zipBuffer.length) })
      res.end(zipBuffer)
    })

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/patches.zip`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms')
    })

    expect(status.state).toBe('ready')
    expect(readFileSync(status.patchedRomPath as string)).toEqual(target)

    db.close()
  })

  it('resolves to an error status immediately for an unsupported download link, without touching the network', async () => {
    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, Buffer.from('some rom bytes'))

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: 'https://github.com/someone/somemod/releases',
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms')
    })

    expect(status.state).toBe('error')
    expect(status.errorMessage).toMatch(/not automatically installable/i)

    db.close()
  })

  /**
   * A .bps or .zip URL on a file host can still serve a click-through page -
   * Dropbox's ?dl=0 links do exactly this - and the extension is the only
   * thing the classifier had to go on.
   */
  it('reports a link that serves a web page instead of the patch it advertises', async () => {
    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, Buffer.from('some rom bytes'))

    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!DOCTYPE html><html><body>Click here to download</body></html>')
    })

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/HoH-Demo-v1.zip?dl=0`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms')
    })

    expect(status.state).toBe('error')
    expect(status.errorMessage).toMatch(/web page/i)

    db.close()
  })

  it('resolves to an error status (does not throw) when the patch does not match the source ROM', async () => {
    const correctSource = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const wrongSource = Buffer.from('ZZZZZBBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched content', 'ascii')
    const patch = buildBpsPatch(correctSource, target)

    const romPath = join(dir, 'wrong-source.z64')
    writeFileSync(romPath, wrongSource)

    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': String(patch.length) })
      res.end(patch)
    })

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/patch.bps`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms')
    })

    expect(status.state).toBe('error')
    expect(status.errorMessage).toMatch(/does not match/i)
    expect(existsSync(join(dir, 'roms', `${modId.replace(/[^a-zA-Z0-9_-]/g, '_')}.z64`))).toBe(
      false
    )

    db.close()
  })

  it('resolves to an error status when the download fails', async () => {
    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, Buffer.from('some rom bytes'))

    const baseUrl = await startServer((_req, res) => {
      res.writeHead(404)
      res.end('not found')
    })

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/missing.bps`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms')
    })

    expect(status.state).toBe('error')
    expect(status.errorMessage).toBeTruthy()

    db.close()
  })

  it('resolves a cancelled download to not_downloaded rather than an error', async () => {
    const romPath = join(dir, 'source.z64')
    writeFileSync(romPath, Buffer.from('some rom bytes'))

    const controller = new AbortController()

    // Announce a body far larger than what's sent, then stall: the download is
    // still in flight when the abort lands.
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '100000' })
      res.write(Buffer.alloc(16))
      controller.abort()
    })

    const { db, modId } = createDbWithMod()

    const status = await installMod({
      db,
      modId,
      downloadUrl: `${baseUrl}/patch.bps`,
      romPath,
      patchCacheDir: join(dir, 'patches'),
      patchedRomDir: join(dir, 'roms'),
      signal: controller.signal
    })

    expect(status.state).toBe('not_downloaded')
    expect(status.errorMessage).toBeNull()
    expect(status.downloadProgressBytes).toBeNull()

    // A cancelled download leaves nothing behind to resume or clean up.
    const stem = modId.replace(/[^a-zA-Z0-9_-]/g, '_')
    expect(existsSync(join(dir, 'patches', `${stem}.bps`))).toBe(false)

    db.close()
  })
})
