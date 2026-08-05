import { describe, expect, it } from 'vitest'
import { KNOWN_EMULATORS, getKnownEmulator } from '@shared/emulators/registry'
import { emulatorsForPlatform, seedFromKnown } from '../../src/renderer/src/lib/emulatorPicker'

describe('emulatorsForPlatform', () => {
  it('excludes emulators that do not ship for the given platform', () => {
    const win = emulatorsForPlatform('win32')
    const mac = emulatorsForPlatform('darwin')

    expect(win.some((e) => e.id === 'project64')).toBe(true)
    expect(mac.some((e) => e.id === 'project64')).toBe(false)
  })
})

describe('seedFromKnown', () => {
  it('seeds name, args and knownId from the registry entry', () => {
    const entry = getKnownEmulator('retroarch')
    if (!entry) throw new Error('expected retroarch in registry')

    const input = seedFromKnown(entry, 'linux')
    expect(input).toEqual({
      name: 'RetroArch',
      executablePath: '',
      argsTemplate: '{romPath}',
      knownId: 'retroarch'
    })
  })

  it('fills in a detected executable path when given one', () => {
    const entry = getKnownEmulator('project64')
    if (!entry) throw new Error('expected project64 in registry')

    const input = seedFromKnown(entry, 'win32', 'C:/Program Files/Project64/Project64.exe')
    expect(input.executablePath).toBe('C:/Program Files/Project64/Project64.exe')
  })

  it('every registry entry has a default args template for each of its platforms', () => {
    for (const entry of KNOWN_EMULATORS) {
      for (const platform of entry.platforms) {
        expect(entry.defaultArgsTemplate[platform]).toBeTruthy()
      }
    }
  })
})
