import { describe, expect, it } from 'vitest'
import { applyBpsPatch, BpsCorruptError, BpsSourceMismatchError } from '../../src/patch/bps'
import { crc32 } from '../../src/patch/crc32'

// Minimal BPS encoder, used only to build synthetic fixtures for these
// tests. It's the direct inverse of the decoder's VLQ scheme (see bps.ts's
// doc comment) - verified by manual trace for 0, 1, 127, 128 in review.

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

function encodeSignedNumber(value: number): number[] {
  const raw = value < 0 ? (-value << 1) | 1 : value << 1
  return encodeNumber(raw)
}

function actionSourceRead(length: number): number[] {
  return encodeNumber(((length - 1) << 2) | 0)
}

function actionTargetRead(bytes: number[]): number[] {
  return [...encodeNumber(((bytes.length - 1) << 2) | 1), ...bytes]
}

function actionSourceCopy(length: number, relativeOffsetDelta: number): number[] {
  return [...encodeNumber(((length - 1) << 2) | 2), ...encodeSignedNumber(relativeOffsetDelta)]
}

function actionTargetCopy(length: number, relativeOffsetDelta: number): number[] {
  return [...encodeNumber(((length - 1) << 2) | 3), ...encodeSignedNumber(relativeOffsetDelta)]
}

function uint32le(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32LE(value, 0)
  return buf
}

function buildBpsPatch(source: Buffer, target: Buffer, actionBytes: number[]): Buffer {
  const body = Buffer.from([
    ...Buffer.from('BPS1', 'ascii'),
    ...encodeNumber(source.length),
    ...encodeNumber(target.length),
    ...encodeNumber(0), // metadataSize
    ...actionBytes
  ])

  const withoutPatchCrc = Buffer.concat([body, uint32le(crc32(source)), uint32le(crc32(target))])
  const patchCrc = uint32le(crc32(withoutPatchCrc))
  return Buffer.concat([withoutPatchCrc, patchCrc])
}

describe('applyBpsPatch', () => {
  it('applies a TargetRead-only patch and produces byte-identical output', () => {
    const source = Buffer.from('hello world', 'ascii')
    const target = Buffer.from('HELLO WORLD!!', 'ascii')

    const patch = buildBpsPatch(source, target, actionTargetRead([...target]))
    const result = applyBpsPatch(source, patch)

    expect(Buffer.compare(result, target)).toBe(0)
  })

  it('applies a patch mixing SourceRead, TargetRead, SourceCopy, and TargetCopy', () => {
    const source = Buffer.from('AAAAABBBBBCCCCC', 'ascii') // 15 bytes
    const target = Buffer.from('AAAAAXXXXXCCCCCAAAAAXXXXX', 'ascii') // 25 bytes

    const actions = [
      ...actionSourceRead(5), // target[0:5)  <- source[0:5)  "AAAAA"
      ...actionTargetRead([...Buffer.from('XXXXX', 'ascii')]), // target[5:10) literal "XXXXX"
      ...actionSourceCopy(5, 10), // target[10:15) <- source[10:15) "CCCCC"
      ...actionSourceCopy(5, -15), // target[15:20) <- source[0:5)   "AAAAA"
      ...actionTargetCopy(5, 5) // target[20:25) <- target[5:10)  "XXXXX"
    ]

    const patch = buildBpsPatch(source, target, actions)
    const result = applyBpsPatch(source, patch)

    expect(Buffer.compare(result, target)).toBe(0)
  })

  it('rejects a patch applied to a source it was not built for', () => {
    const source = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const wrongSource = Buffer.from('ZZZZZBBBBBCCCCC', 'ascii')
    const target = Buffer.from('patched target data', 'ascii')

    const patch = buildBpsPatch(source, target, actionTargetRead([...target]))

    expect(() => applyBpsPatch(wrongSource, patch)).toThrow(BpsSourceMismatchError)
  })

  it('rejects a truncated patch file', () => {
    const source = Buffer.from('hello world', 'ascii')
    const target = Buffer.from('HELLO WORLD!!', 'ascii')
    const patch = buildBpsPatch(source, target, actionTargetRead([...target]))

    const truncated = patch.subarray(0, patch.length - 3)

    expect(() => applyBpsPatch(source, truncated)).toThrow(BpsCorruptError)
  })

  it('rejects a file with the wrong magic header', () => {
    const notBps = Buffer.concat([Buffer.from('NOPE', 'ascii'), Buffer.alloc(20)])

    expect(() => applyBpsPatch(Buffer.from('x'), notBps)).toThrow(BpsCorruptError)
  })

  it('rejects a buffer too small to contain a header and footer', () => {
    expect(() => applyBpsPatch(Buffer.from('x'), Buffer.alloc(5))).toThrow(BpsCorruptError)
  })

  it('does not mutate the source buffer', () => {
    const source = Buffer.from('AAAAABBBBBCCCCC', 'ascii')
    const sourceCopy = Buffer.from(source)
    const target = Buffer.from('changed data here', 'ascii')

    const patch = buildBpsPatch(source, target, actionTargetRead([...target]))
    applyBpsPatch(source, patch)

    expect(Buffer.compare(source, sourceCopy)).toBe(0)
  })
})
