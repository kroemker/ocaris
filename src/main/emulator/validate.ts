import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'

export interface ExecutablePathValidation {
  exists: boolean
  isFile: boolean
  executable: boolean
}

/**
 * On POSIX this checks the executable bit. On Windows, fs.access() treats
 * X_OK as F_OK (Node has no concept of an "executable bit" there), so this
 * effectively degrades to an existence/file-type check on that platform -
 * which matches how Windows itself decides what's runnable (by extension,
 * not a permission bit).
 */
export async function validateExecutablePath(path: string): Promise<ExecutablePathValidation> {
  let stats
  try {
    stats = await stat(path)
  } catch {
    return { exists: false, isFile: false, executable: false }
  }

  if (!stats.isFile()) {
    return { exists: true, isFile: false, executable: false }
  }

  try {
    await access(path, constants.X_OK)
    return { exists: true, isFile: true, executable: true }
  } catch {
    return { exists: true, isFile: true, executable: false }
  }
}
