import { describe, expect, it } from 'vitest'
import { KNOWN_GOOD_OOT_1_0_HEADER_CRC } from '../../../src/main/rom/checksums'
import {
  evaluateHeaderCrc,
  readHeaderCrcFromBuffer,
  RomVerificationError
} from '../../../src/main/rom/verify'

function buildSyntheticRom(headerCrc: Buffer, totalLength = 64): Buffer {
  const rom = Buffer.alloc(totalLength, 0xff)
  headerCrc.copy(rom, 0x10)
  return rom
}

describe('ROM header CRC verification', () => {
  it('verifies a ROM whose header CRC matches the known-good decompressed pattern', () => {
    const rom = buildSyntheticRom(KNOWN_GOOD_OOT_1_0_HEADER_CRC.decompressed)
    const result = evaluateHeaderCrc(readHeaderCrcFromBuffer(rom))

    expect(result.verified).toBe(true)
    expect(result.variant).toBe('decompressed')
  })

  it('verifies a ROM whose header CRC matches the compressed pattern', () => {
    const rom = buildSyntheticRom(KNOWN_GOOD_OOT_1_0_HEADER_CRC.compressed)
    const result = evaluateHeaderCrc(readHeaderCrcFromBuffer(rom))

    expect(result.verified).toBe(true)
    expect(result.variant).toBe('compressed')
  })

  it('reports a mismatch for an unrecognized header CRC without throwing', () => {
    const rom = buildSyntheticRom(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))
    const result = evaluateHeaderCrc(readHeaderCrcFromBuffer(rom))

    expect(result.verified).toBe(false)
    expect(result.variant).toBeNull()
    expect(result.headerCrcHex).toBe('0001020304050607')
  })

  it('throws a descriptive error for a file too small to contain a header', () => {
    const tooSmall = Buffer.alloc(8)
    expect(() => readHeaderCrcFromBuffer(tooSmall)).toThrow(RomVerificationError)
  })
})
