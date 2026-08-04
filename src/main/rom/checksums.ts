/**
 * N64 ROMs embed a header CRC1+CRC2 pair (8 bytes at offset 0x10) computed by
 * Nintendo's boot code over the cartridge contents. Checking against these
 * bytes is more robust than a whole-file hash: it's format-tolerant (no
 * dependency on trimmed/padded trailing bytes) and only requires reading the
 * first 24 bytes of the file rather than the full ~32-64MB ROM.
 *
 * Known-good values sourced from OoT-Randomizer's own input validation
 * (Rom.py, `valid_crc`), the most authoritative real-world reference for
 * "is this OoT 1.0 NTSC-U" short of a manually reverse-engineered dump:
 * https://github.com/OoTRandomizer/OoT-Randomizer/blob/Dev/Rom.py
 */

export const ROM_HEADER_CRC_OFFSET = 0x10
export const ROM_HEADER_CRC_LENGTH = 8

export type RomVariant = 'compressed' | 'byteswap-compressed' | 'decompressed'

export const KNOWN_GOOD_OOT_1_0_HEADER_CRC: Record<RomVariant, Buffer> = {
  compressed: Buffer.from([0xec, 0x70, 0x11, 0xb7, 0x76, 0x16, 0xd7, 0x2b]),
  'byteswap-compressed': Buffer.from([0x70, 0xec, 0xb7, 0x11, 0x16, 0x76, 0x2b, 0xd7]),
  decompressed: Buffer.from([0x93, 0x52, 0x2e, 0x7b, 0xe5, 0x06, 0xd4, 0x27])
}

export function matchRomVariant(headerCrc: Buffer): RomVariant | null {
  for (const [variant, known] of Object.entries(KNOWN_GOOD_OOT_1_0_HEADER_CRC) as [
    RomVariant,
    Buffer
  ][]) {
    if (headerCrc.equals(known)) return variant
  }
  return null
}
