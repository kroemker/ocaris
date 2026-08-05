/**
 * Curated list of common N64 emulators, seeded as a starting point for the
 * "add emulator" picker and auto-detect scan. Pure data - no Node/Electron
 * APIs - so it's importable from both the main process (detection) and the
 * renderer (picker UI), unlike src/main/emulator which is main-only.
 *
 * installPaths use {token} placeholders for OS-specific directories
 * (resolved against real values in src/main/emulator/detect.ts) since the
 * underlying env vars/paths only make sense to resolve at detection time,
 * not to hardcode here.
 *
 * defaultArgsTemplate is best-effort: most of these emulators accept a bare
 * ROM path, but some (RetroArch in particular, which needs a core) may need
 * the user to extend the template after picking it - the UI surfaces that.
 */

export type EmulatorPlatform = 'win32' | 'darwin' | 'linux'

export interface KnownEmulator {
  id: string
  name: string
  platforms: EmulatorPlatform[]
  defaultArgsTemplate: Partial<Record<EmulatorPlatform, string>>
  executableNames: Partial<Record<EmulatorPlatform, string[]>>
  installPaths: Partial<Record<EmulatorPlatform, string[]>>
}

export const KNOWN_EMULATORS: KnownEmulator[] = [
  {
    id: 'project64',
    name: 'Project64',
    platforms: ['win32'],
    defaultArgsTemplate: { win32: '{romPath}' },
    executableNames: { win32: ['Project64.exe'] },
    installPaths: {
      win32: [
        '{programFiles}/Project64 3.0',
        '{programFiles}/Project64',
        '{programFilesX86}/Project64 3.0',
        '{programFilesX86}/Project64'
      ]
    }
  },
  {
    id: 'retroarch',
    name: 'RetroArch',
    platforms: ['win32', 'darwin', 'linux'],
    defaultArgsTemplate: { win32: '{romPath}', darwin: '{romPath}', linux: '{romPath}' },
    executableNames: {
      win32: ['retroarch.exe'],
      darwin: ['RetroArch'],
      linux: ['retroarch']
    },
    installPaths: {
      win32: ['{programFiles}/RetroArch-Win64', '{programFiles}/RetroArch'],
      darwin: ['/Applications/RetroArch.app/Contents/MacOS'],
      linux: ['/usr/bin', '/usr/local/bin', '{home}/.var/app/org.libretro.RetroArch/current']
    }
  },
  {
    id: 'simple64',
    name: 'simple64',
    platforms: ['win32', 'linux'],
    defaultArgsTemplate: { win32: '{romPath}', linux: '{romPath}' },
    executableNames: {
      win32: ['simple64-gui.exe'],
      linux: ['simple64-gui', 'simple64-gui.AppImage']
    },
    installPaths: {
      win32: ['{programFiles}/simple64'],
      linux: ['{home}/Applications', '{home}/.local/bin']
    }
  },
  {
    id: 'rmg',
    name: "Rosalie's Mupen GUI",
    platforms: ['win32', 'linux'],
    defaultArgsTemplate: { win32: '{romPath}', linux: '{romPath}' },
    executableNames: { win32: ['RMG.exe'], linux: ['RMG', 'RMG-AppImage'] },
    installPaths: {
      win32: ['{programFiles}/Rosalies Mupen GUI', '{programFiles}/RMG'],
      linux: ['{home}/Applications', '/usr/bin', '/usr/local/bin']
    }
  },
  {
    id: 'ares',
    name: 'ares',
    platforms: ['win32', 'darwin', 'linux'],
    defaultArgsTemplate: { win32: '{romPath}', darwin: '{romPath}', linux: '{romPath}' },
    executableNames: { win32: ['ares.exe'], darwin: ['ares'], linux: ['ares'] },
    installPaths: {
      win32: ['{programFiles}/ares'],
      darwin: ['/Applications/ares.app/Contents/MacOS'],
      linux: ['/usr/bin', '/usr/local/bin', '{home}/.local/bin']
    }
  }
]

export function getKnownEmulator(id: string): KnownEmulator | undefined {
  return KNOWN_EMULATORS.find((e) => e.id === id)
}
