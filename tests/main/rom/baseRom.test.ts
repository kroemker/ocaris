import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BASE_ROM_FILE_NAME, baseRomPath, copyBaseRom } from '../../../src/main/rom/baseRom'

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('copyBaseRom', () => {
  it('copies the source ROM into the base ROM directory under a fixed name', async () => {
    const sourceDir = tmp('ocaris-rom-source-')
    const baseRomDir = join(tmp('ocaris-rom-dest-'), 'base')
    const sourcePath = join(sourceDir, 'my weird filename (U) [!].z64')
    writeFileSync(sourcePath, 'rom-bytes')

    const managedPath = await copyBaseRom(sourcePath, baseRomDir)

    expect(managedPath).toBe(baseRomPath(baseRomDir))
    expect(readFileSync(managedPath, 'utf8')).toBe('rom-bytes')
    // The source is never touched, only copied from.
    expect(readFileSync(sourcePath, 'utf8')).toBe('rom-bytes')
  })

  it('overwrites a previous copy in place rather than accumulating files', async () => {
    const sourceDir = tmp('ocaris-rom-source-')
    const baseRomDir = tmp('ocaris-rom-dest-')

    const first = join(sourceDir, 'first.z64')
    writeFileSync(first, 'version-one')
    await copyBaseRom(first, baseRomDir)

    const second = join(sourceDir, 'second.v64')
    writeFileSync(second, 'version-two')
    const managedPath = await copyBaseRom(second, baseRomDir)

    expect(readFileSync(managedPath, 'utf8')).toBe('version-two')
    expect(await readdir(baseRomDir)).toEqual([BASE_ROM_FILE_NAME])
  })

  it('leaves no leftover .part file behind on success', async () => {
    const sourceDir = tmp('ocaris-rom-source-')
    const baseRomDir = tmp('ocaris-rom-dest-')
    const sourcePath = join(sourceDir, 'rom.z64')
    writeFileSync(sourcePath, 'rom-bytes')

    await copyBaseRom(sourcePath, baseRomDir)

    expect(existsSync(`${baseRomPath(baseRomDir)}.part`)).toBe(false)
  })

  it('is a no-op when the source is already the managed copy', async () => {
    const baseRomDir = tmp('ocaris-rom-dest-')
    const managedPath = baseRomPath(baseRomDir)
    // Simulate a prior copy without going through copyBaseRom, so a second
    // call touching the same bytes would prove it skipped the self-copy.
    await mkdir(baseRomDir, { recursive: true })
    await writeFile(managedPath, 'already-managed')

    const result = await copyBaseRom(managedPath, baseRomDir)

    expect(result).toBe(managedPath)
    expect(readFileSync(managedPath, 'utf8')).toBe('already-managed')
  })
})
