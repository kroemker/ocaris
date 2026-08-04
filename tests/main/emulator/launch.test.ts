import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildArgv, launchEmulator, LaunchError } from '../../../src/main/emulator/launch'

describe('buildArgv', () => {
  it('splits on whitespace and substitutes {romPath} per token', () => {
    expect(buildArgv('-L core.so {romPath}', '/roms/game.z64')).toEqual([
      '-L',
      'core.so',
      '/roms/game.z64'
    ])
  })

  it('keeps a rom path containing spaces as a single argv entry', () => {
    expect(buildArgv('{romPath}', '/roms/my game.z64')).toEqual(['/roms/my game.z64'])
  })

  it('substitutes {romPath} even when combined with other text in one token', () => {
    expect(buildArgv('--rom={romPath}', '/roms/game.z64')).toEqual(['--rom=/roms/game.z64'])
  })

  it('collapses repeated whitespace and trims', () => {
    expect(buildArgv('  --fullscreen   {romPath}  ', '/roms/game.z64')).toEqual([
      '--fullscreen',
      '/roms/game.z64'
    ])
  })
})

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('launchEmulator', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ocaris-launch-'))
  })

  it('spawns the executable with the substituted argv', async () => {
    const outFile = join(dir, 'argv.json')
    const scriptPath = join(dir, 'fake-emulator.cjs')
    writeFileSync(
      scriptPath,
      `require('fs').writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(process.argv.slice(2)))`
    )

    const romPath = join(dir, 'game.z64')
    const pid = await launchEmulator(process.execPath, `${scriptPath} --rom {romPath}`, romPath)

    expect(typeof pid).toBe('number')

    await waitFor(() => existsSync(outFile))
    expect(JSON.parse(readFileSync(outFile, 'utf8'))).toEqual(['--rom', romPath])
  })

  it('rejects with LaunchError when the executable does not exist', async () => {
    await expect(
      launchEmulator(join(dir, 'no-such-binary'), '{romPath}', join(dir, 'game.z64'))
    ).rejects.toThrow(LaunchError)
  })
})
