import type { ExecutablePathValidation } from './validate'

export interface EmulatorValidationError {
  field: 'name' | 'executablePath' | 'argsTemplate'
  message: string
}

export interface EmulatorInputLike {
  name: string
  executablePath: string
  argsTemplate: string
}

export function validateEmulatorInput(
  input: EmulatorInputLike,
  pathValidation: ExecutablePathValidation
): EmulatorValidationError[] {
  const errors: EmulatorValidationError[] = []

  if (input.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required.' })
  }

  if (!pathValidation.exists) {
    errors.push({ field: 'executablePath', message: 'File does not exist.' })
  } else if (!pathValidation.isFile) {
    errors.push({ field: 'executablePath', message: 'Path is not a file.' })
  } else if (!pathValidation.executable) {
    errors.push({ field: 'executablePath', message: 'File is not executable.' })
  }

  if (!input.argsTemplate.includes('{romPath}')) {
    errors.push({
      field: 'argsTemplate',
      message: 'Argument template must include the {romPath} placeholder.'
    })
  }

  return errors
}
