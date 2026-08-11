import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateExecutablePath } from '../../../src/main/emulator/validate'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocaris-emu-'))
})

describe('validateExecutablePath', () => {
  it('reports a nonexistent path', async () => {
    const result = await validateExecutablePath(join(dir, 'does-not-exist'))
    expect(result).toEqual({ exists: false, isFile: false, executable: false })
  })

  it('reports a directory as not a file', async () => {
    const subdir = join(dir, 'a-directory')
    mkdirSync(subdir)
    const result = await validateExecutablePath(subdir)
    expect(result).toEqual({ exists: true, isFile: false, executable: false })
  })

  // POSIX only: Node maps X_OK to F_OK on Windows, so validateExecutablePath
  // deliberately degrades to an existence check there (see its doc comment)
  // and every existing file reads as executable. There is no behaviour to
  // assert on that platform, not a bug being skipped past.
  it.skipIf(process.platform === 'win32')(
    'reports a non-executable file as not executable',
    async () => {
      const file = join(dir, 'not-executable')
      writeFileSync(file, '#!/bin/sh\necho hi\n')
      chmodSync(file, 0o644)
      const result = await validateExecutablePath(file)
      expect(result).toEqual({ exists: true, isFile: true, executable: false })
    }
  )

  it('reports an executable file as executable', async () => {
    const file = join(dir, 'executable')
    writeFileSync(file, '#!/bin/sh\necho hi\n')
    chmodSync(file, 0o755)
    const result = await validateExecutablePath(file)
    expect(result).toEqual({ exists: true, isFile: true, executable: true })
  })
})
