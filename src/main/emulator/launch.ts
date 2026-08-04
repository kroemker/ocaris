import { spawn } from 'node:child_process'

export class LaunchError extends Error {}

/**
 * Splits the template on whitespace first, then substitutes {romPath}
 * within each token - so a ROM path containing spaces stays a single argv
 * entry instead of being split apart by the substitution.
 */
export function buildArgv(argsTemplate: string, romPath: string): string[] {
  return argsTemplate
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.replaceAll('{romPath}', romPath))
}

/**
 * Spawns the emulator detached from Ocaris (so it keeps running if Ocaris
 * closes) and waits for Node's 'spawn'/'error' events to know whether the
 * process actually started, rather than assuming success synchronously -
 * spawn() returns a ChildProcess even when the executable doesn't exist.
 */
export function launchEmulator(
  executablePath: string,
  argsTemplate: string,
  romPath: string
): Promise<number> {
  const argv = buildArgv(argsTemplate, romPath)

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, argv, { detached: true, stdio: 'ignore' })

    child.once('error', (err) => {
      reject(new LaunchError(`Failed to launch emulator: ${err.message}`))
    })

    child.once('spawn', () => {
      child.unref()
      resolve(child.pid as number)
    })
  })
}
