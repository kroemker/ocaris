import { crc32 } from './crc32'

/**
 * BPS ("beat patch system") format applier.
 *
 * Format (see https://gist.github.com/khadiwala/32b16f8bb3d0a97e0f60):
 *   "BPS1" magic, then VLQ-encoded sourceSize/targetSize/metadataSize,
 *   metadata bytes, a stream of copy/read actions, and a 12-byte footer of
 *   three little-endian CRC32s: source, target, and patch-self checksum.
 *
 * The VLQ ("BPS number") encoding accumulates an offset on each
 * continuation byte so that every value has exactly one valid encoding:
 *   data = 0, shift = 1
 *   loop: byte = next(); data += (byte & 0x7f) * shift
 *         if (byte & 0x80) break
 *         shift <<= 7; data += shift
 */

export class BpsError extends Error {}
export class BpsCorruptError extends BpsError {}
export class BpsSourceMismatchError extends BpsError {}

const MAGIC = 'BPS1'
const FOOTER_SIZE = 12

const enum Action {
  SourceRead = 0,
  TargetRead = 1,
  SourceCopy = 2,
  TargetCopy = 3
}

class PatchReader {
  private pos: number

  constructor(
    private readonly buf: Buffer,
    start: number,
    private readonly end: number
  ) {
    this.pos = start
  }

  readByte(): number {
    if (this.pos >= this.end) {
      throw new BpsCorruptError('Unexpected end of patch data.')
    }
    return this.buf[this.pos++]
  }

  readBytes(length: number): Buffer {
    if (this.pos + length > this.end) {
      throw new BpsCorruptError('Unexpected end of patch data.')
    }
    const slice = this.buf.subarray(this.pos, this.pos + length)
    this.pos += length
    return slice
  }

  readNumber(): number {
    let data = 0
    let shift = 1
    for (;;) {
      const byte = this.readByte()
      data += (byte & 0x7f) * shift
      if (byte & 0x80) break
      shift <<= 7
      data += shift
    }
    return data
  }

  readSignedNumber(): number {
    const raw = this.readNumber()
    const sign = raw & 1
    const value = raw >>> 1
    return sign ? -value : value
  }

  atEnd(): boolean {
    return this.pos >= this.end
  }
}

export function applyBpsPatch(source: Buffer, patch: Buffer): Buffer {
  if (patch.length < MAGIC.length + FOOTER_SIZE) {
    throw new BpsCorruptError('Patch file is too small to be a valid BPS patch.')
  }
  if (patch.subarray(0, 4).toString('ascii') !== MAGIC) {
    throw new BpsCorruptError('Not a BPS patch (missing "BPS1" magic).')
  }

  const footerStart = patch.length - FOOTER_SIZE
  const expectedSourceCrc = patch.readUInt32LE(footerStart)
  const expectedTargetCrc = patch.readUInt32LE(footerStart + 4)
  const expectedPatchCrc = patch.readUInt32LE(footerStart + 8)

  if (crc32(patch.subarray(0, patch.length - 4)) !== expectedPatchCrc) {
    throw new BpsCorruptError('Patch file failed its own integrity check (corrupt or truncated).')
  }

  const actualSourceCrc = crc32(source)
  if (actualSourceCrc !== expectedSourceCrc) {
    throw new BpsSourceMismatchError(
      `This patch does not match the provided source ROM (expected CRC32 ` +
        `${expectedSourceCrc.toString(16).padStart(8, '0')}, got ` +
        `${actualSourceCrc.toString(16).padStart(8, '0')}).`
    )
  }

  const reader = new PatchReader(patch, 4, footerStart)
  const sourceSize = reader.readNumber()
  const targetSize = reader.readNumber()
  const metadataSize = reader.readNumber()
  reader.readBytes(metadataSize)

  if (sourceSize !== source.length) {
    throw new BpsSourceMismatchError(
      `This patch expects a source ROM of ${sourceSize} bytes, but the provided ROM is ` +
        `${source.length} bytes.`
    )
  }

  const target = Buffer.alloc(targetSize)
  let outputOffset = 0
  let sourceRelativeOffset = 0
  let targetRelativeOffset = 0

  while (!reader.atEnd()) {
    const actionData = reader.readNumber()
    const command = actionData & 3
    const length = (actionData >>> 2) + 1

    if (outputOffset + length > targetSize) {
      throw new BpsCorruptError('Patch action would write past the end of the target buffer.')
    }

    switch (command) {
      case Action.SourceRead:
        if (outputOffset + length > source.length) {
          throw new BpsCorruptError('Patch action reads past the end of the source ROM.')
        }
        source.copy(target, outputOffset, outputOffset, outputOffset + length)
        outputOffset += length
        break

      case Action.TargetRead: {
        const literal = reader.readBytes(length)
        literal.copy(target, outputOffset)
        outputOffset += length
        break
      }

      case Action.SourceCopy: {
        sourceRelativeOffset += reader.readSignedNumber()
        if (sourceRelativeOffset < 0 || sourceRelativeOffset + length > source.length) {
          throw new BpsCorruptError('Patch action references data outside the source ROM.')
        }
        source.copy(target, outputOffset, sourceRelativeOffset, sourceRelativeOffset + length)
        sourceRelativeOffset += length
        outputOffset += length
        break
      }

      case Action.TargetCopy: {
        targetRelativeOffset += reader.readSignedNumber()
        if (targetRelativeOffset < 0 || targetRelativeOffset + length > targetSize) {
          throw new BpsCorruptError('Patch action references data outside the target buffer.')
        }
        // Byte-by-byte: source and destination ranges can overlap (used to
        // encode repeating runs), so a bulk copy would read already-written
        // output mid-copy instead of the original run.
        for (let i = 0; i < length; i++) {
          target[outputOffset + i] = target[targetRelativeOffset + i]
        }
        targetRelativeOffset += length
        outputOffset += length
        break
      }
    }
  }

  if (outputOffset !== targetSize) {
    throw new BpsCorruptError(
      `Patch produced ${outputOffset} bytes but declared a target size of ${targetSize} bytes.`
    )
  }

  if (crc32(target) !== expectedTargetCrc) {
    throw new BpsCorruptError('Patched output failed its integrity check.')
  }

  return target
}
