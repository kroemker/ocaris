import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import type { DetectedEmulator } from '@shared/ipc'
import { KNOWN_EMULATORS, type EmulatorPlatform } from '@shared/emulators/registry'
import { validateExecutablePath } from './validate'

/**
 * Resolves the {token} placeholders used in registry installPaths against
 * this machine's actual directories. Kept separate from the registry itself
 * since the registry is also imported renderer-side, where these env
 * vars/paths don't apply.
 */
function pathTokens(): Record<string, string | undefined> {
  return {
    home: homedir(),
    programFiles: process.env['ProgramFiles'],
    programFilesX86: process.env['ProgramFiles(x86)']
  }
}

function resolvePathTemplate(
  template: string,
  tokens: Record<string, string | undefined>
): string | null {
  let result = template
  for (const [key, value] of Object.entries(tokens)) {
    if (!value) continue
    result = result.replaceAll(`{${key}}`, value)
  }
  return result.includes('{') ? null : result
}

async function isExecutableFile(path: string): Promise<boolean> {
  const result = await validateExecutablePath(path)
  return result.executable
}

export function currentPlatform(): EmulatorPlatform | null {
  const platform = process.platform
  return platform === 'win32' || platform === 'darwin' || platform === 'linux' ? platform : null
}

function pathDirs(): string[] {
  return (process.env['PATH'] ?? '').split(delimiter).filter((dir) => dir.length > 0)
}

/**
 * Scans this machine for known emulators: known install directories plus
 * every directory on PATH. Returns at most one match per registry entry
 * (the first found), excluding any path already configured in the app.
 */
export async function detectEmulators(existingPaths: string[]): Promise<DetectedEmulator[]> {
  const platform = currentPlatform()
  if (!platform) return []

  const tokens = pathTokens()
  const existing = new Set(existingPaths.map((p) => (platform === 'win32' ? p.toLowerCase() : p)))
  const normalize = (p: string): string => (platform === 'win32' ? p.toLowerCase() : p)

  const results: DetectedEmulator[] = []

  for (const entry of KNOWN_EMULATORS) {
    if (!entry.platforms.includes(platform)) continue
    const executableNames = entry.executableNames[platform] ?? []
    if (executableNames.length === 0) continue

    const candidateDirs = [...(entry.installPaths[platform] ?? []), ...pathDirs()]

    let found: string | null = null
    for (const dirTemplate of candidateDirs) {
      const dir = dirTemplate.includes('{') ? resolvePathTemplate(dirTemplate, tokens) : dirTemplate
      if (!dir) continue

      for (const executableName of executableNames) {
        const candidate = join(dir, executableName)
        if (existing.has(normalize(candidate))) continue
        if (await isExecutableFile(candidate)) {
          found = candidate
          break
        }
      }
      if (found) break
    }

    if (found) {
      results.push({ knownId: entry.id, executablePath: found })
    }
  }

  return results
}
