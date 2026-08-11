import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectEmulators } from '../../../src/main/emulator/detect'

let dir: string
let originalPath: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-detect-'))
  originalPath = process.env['PATH']
})

afterEach(() => {
  process.env['PATH'] = originalPath
})

function addToPath(executableName: string): void {
  const file = join(dir, executableName)
  writeFileSync(file, '#!/bin/sh\necho hi\n')
  chmodSync(file, 0o755)
  process.env['PATH'] = `${dir}${delimiter}${originalPath ?? ''}`
}

// detectEmulators reads process.platform to decide which executable names to
// look for, so these fixtures ('retroarch', an executable bit and no .exe)
// only describe a POSIX host. On Windows the positive case can't be set up at
// all and the negative ones would pass without proving anything, so the whole
// block is a no-op there rather than a false green.
describe.skipIf(process.platform === 'win32')('detectEmulators (linux)', () => {
  it('finds a known emulator on PATH', async () => {
    addToPath('retroarch')

    const found = await detectEmulators([])
    expect(found).toContainEqual({ knownId: 'retroarch', executablePath: join(dir, 'retroarch') })
  })

  it('does not report an emulator already configured at that path', async () => {
    addToPath('retroarch')

    const found = await detectEmulators([join(dir, 'retroarch')])
    expect(found.find((e) => e.knownId === 'retroarch')).toBeUndefined()
  })

  it('ignores a non-executable file with a matching name', async () => {
    const file = join(dir, 'retroarch')
    writeFileSync(file, '#!/bin/sh\necho hi\n')
    chmodSync(file, 0o644)
    process.env['PATH'] = `${dir}${delimiter}${originalPath ?? ''}`

    const found = await detectEmulators([])
    expect(found.find((e) => e.knownId === 'retroarch')).toBeUndefined()
  })

  it('finds nothing when PATH has no matching executables', async () => {
    process.env['PATH'] = dir

    const found = await detectEmulators([])
    expect(found).toEqual([])
  })
})
