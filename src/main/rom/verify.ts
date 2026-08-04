import { open } from 'node:fs/promises'
import {
  KNOWN_GOOD_OOT_1_0_HEADER_CRC,
  matchRomVariant,
  ROM_HEADER_CRC_LENGTH,
  ROM_HEADER_CRC_OFFSET,
  type RomVariant
} from './checksums'

export interface RomVerificationResult {
  verified: boolean
  variant: RomVariant | null
  headerCrcHex: string
}

export class RomVerificationError extends Error {}

async function readHeaderCrc(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(ROM_HEADER_CRC_LENGTH)
    const { bytesRead } = await handle.read(buffer, 0, ROM_HEADER_CRC_LENGTH, ROM_HEADER_CRC_OFFSET)
    if (bytesRead < ROM_HEADER_CRC_LENGTH) {
      throw new RomVerificationError(
        `File is too small to be a valid N64 ROM (expected at least ${ROM_HEADER_CRC_OFFSET + ROM_HEADER_CRC_LENGTH} bytes).`
      )
    }
    return buffer
  } finally {
    await handle.close()
  }
}

export function readHeaderCrcFromBuffer(rom: Buffer): Buffer {
  if (rom.length < ROM_HEADER_CRC_OFFSET + ROM_HEADER_CRC_LENGTH) {
    throw new RomVerificationError(
      `File is too small to be a valid N64 ROM (expected at least ${ROM_HEADER_CRC_OFFSET + ROM_HEADER_CRC_LENGTH} bytes).`
    )
  }
  return rom.subarray(ROM_HEADER_CRC_OFFSET, ROM_HEADER_CRC_OFFSET + ROM_HEADER_CRC_LENGTH)
}

export function evaluateHeaderCrc(headerCrc: Buffer): RomVerificationResult {
  const variant = matchRomVariant(headerCrc)
  return {
    verified: variant !== null,
    variant,
    headerCrcHex: headerCrc.toString('hex')
  }
}

export async function verifyRomFile(filePath: string): Promise<RomVerificationResult> {
  const headerCrc = await readHeaderCrc(filePath)
  return evaluateHeaderCrc(headerCrc)
}

export { KNOWN_GOOD_OOT_1_0_HEADER_CRC }
