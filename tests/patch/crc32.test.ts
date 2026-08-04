import { describe, expect, it } from 'vitest'
import { crc32 } from '../../src/patch/crc32'

describe('crc32', () => {
  it('matches the standard CRC-32/ISO-HDLC check value for "123456789"', () => {
    // The universally-used conformance vector for this exact CRC-32 variant.
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926)
  })

  it('returns the same value for repeated calls on the same input', () => {
    const data = Buffer.from('the quick brown fox', 'ascii')
    expect(crc32(data)).toBe(crc32(data))
  })

  it('produces different checksums for different inputs', () => {
    expect(crc32(Buffer.from('a'))).not.toBe(crc32(Buffer.from('b')))
  })

  it('handles an empty buffer', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0)
  })
})
