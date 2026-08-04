import { describe, expect, it } from 'vitest'
import { validateEmulatorInput } from '../../../src/main/emulator/validateInput'
import type { ExecutablePathValidation } from '../../../src/main/emulator/validate'

const okPath: ExecutablePathValidation = { exists: true, isFile: true, executable: true }

describe('validateEmulatorInput', () => {
  it('passes for a well-formed input', () => {
    const errors = validateEmulatorInput(
      { name: 'RetroArch', executablePath: '/usr/bin/retroarch', argsTemplate: '{romPath}' },
      okPath
    )
    expect(errors).toEqual([])
  })

  it('rejects an empty name', () => {
    const errors = validateEmulatorInput(
      { name: '  ', executablePath: '/usr/bin/retroarch', argsTemplate: '{romPath}' },
      okPath
    )
    expect(errors).toContainEqual({ field: 'name', message: 'Name is required.' })
  })

  it('rejects an argsTemplate missing the {romPath} placeholder', () => {
    const errors = validateEmulatorInput(
      { name: 'RetroArch', executablePath: '/usr/bin/retroarch', argsTemplate: '--fullscreen' },
      okPath
    )
    expect(errors).toContainEqual({
      field: 'argsTemplate',
      message: 'Argument template must include the {romPath} placeholder.'
    })
  })

  it('reports a nonexistent executable path', () => {
    const errors = validateEmulatorInput(
      { name: 'RetroArch', executablePath: '/no/such/binary', argsTemplate: '{romPath}' },
      { exists: false, isFile: false, executable: false }
    )
    expect(errors).toContainEqual({ field: 'executablePath', message: 'File does not exist.' })
  })

  it('reports a path that is not a file', () => {
    const errors = validateEmulatorInput(
      { name: 'RetroArch', executablePath: '/usr/bin', argsTemplate: '{romPath}' },
      { exists: true, isFile: false, executable: false }
    )
    expect(errors).toContainEqual({ field: 'executablePath', message: 'Path is not a file.' })
  })

  it('reports a non-executable file', () => {
    const errors = validateEmulatorInput(
      { name: 'RetroArch', executablePath: '/usr/bin/retroarch', argsTemplate: '{romPath}' },
      { exists: true, isFile: true, executable: false }
    )
    expect(errors).toContainEqual({ field: 'executablePath', message: 'File is not executable.' })
  })

  it('accumulates multiple errors at once', () => {
    const errors = validateEmulatorInput(
      { name: '', executablePath: '/no/such/binary', argsTemplate: '' },
      { exists: false, isFile: false, executable: false }
    )
    expect(errors).toHaveLength(3)
  })
})
