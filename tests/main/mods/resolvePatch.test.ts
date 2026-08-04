import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import {
  classifyDownloadLink,
  findMatchingPatchInZip,
  PatchResolutionError
} from '../../../src/main/mods/resolvePatch'
import { crc32 } from '../../../src/patch/crc32'

// Same minimal BPS encoder as tests/patch/bps.test.ts.
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

describe('classifyDownloadLink', () => {
  it('classifies a bare .bps link as direct-bps', () => {
    expect(classifyDownloadLink('https://hylianmodding.com/mods/x/patch.bps')).toBe('direct-bps')
  })

  it('classifies a .zip link as archive', () => {
    expect(classifyDownloadLink('https://hylianmodding.com/mods/x/patch.zip')).toBe('archive')
  })

  it('classifies a .7z link as unsupported', () => {
    expect(classifyDownloadLink('https://hylianmodding.com/mods/x/patch.7z')).toBe('unsupported')
  })

  it('classifies an external GitHub Releases link as unsupported', () => {
    expect(classifyDownloadLink('https://github.com/someone/somemod/releases')).toBe('unsupported')
  })

  it('classifies a malformed URL as unsupported rather than throwing', () => {
    expect(classifyDownloadLink('not a url')).toBe('unsupported')
  })
})

describe('findMatchingPatchInZip', () => {
  it('picks the patch whose embedded source CRC matches, ignoring filenames', () => {
    const sourceA = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const sourceB = Buffer.from('ZZZZZBBBBBCCCCC', 'ascii')
    const targetA = Buffer.from('patched for source A', 'ascii')
    const targetB = Buffer.from('patched for source B', 'ascii')

    const zip = new AdmZip()
    // Deliberately misleading names - the resolver must not trust them.
    zip.addFile('game_U_1.2.bps', buildBpsPatch(sourceB, targetB))
    zip.addFile('game_U_1.0.bps', buildBpsPatch(sourceA, targetA))
    const zipBuffer = zip.toBuffer()

    const resolved = findMatchingPatchInZip(zipBuffer, sourceA)
    expect(Buffer.compare(resolved, buildBpsPatch(sourceA, targetA))).toBe(0)
  })

  it('throws when the archive has no .bps entries', () => {
    const zip = new AdmZip()
    zip.addFile('readme.txt', Buffer.from('hello'))
    expect(() => findMatchingPatchInZip(zip.toBuffer(), Buffer.from('source'))).toThrow(
      PatchResolutionError
    )
  })

  it('throws when no patch in the archive matches the given source', () => {
    const sourceA = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const sourceOther = Buffer.from('ZZZZZBBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched data', 'ascii')

    const zip = new AdmZip()
    zip.addFile('patch.bps', buildBpsPatch(sourceA, target))

    expect(() => findMatchingPatchInZip(zip.toBuffer(), sourceOther)).toThrow(PatchResolutionError)
  })

  it('skips a malformed .bps entry instead of crashing', () => {
    const sourceA = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched data', 'ascii')

    const zip = new AdmZip()
    zip.addFile('corrupt.bps', Buffer.from('not a real bps file'))
    zip.addFile('real.bps', buildBpsPatch(sourceA, target))

    const resolved = findMatchingPatchInZip(zip.toBuffer(), sourceA)
    expect(Buffer.compare(resolved, buildBpsPatch(sourceA, target))).toBe(0)
  })
})
