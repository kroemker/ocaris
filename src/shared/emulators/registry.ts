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
 *
 * `download` is deliberately absent from two entries:
 *  - Project64 is closed-source with no stable, programmatically discoverable
 *    download URL and unclear redistribution terms - same concern already
 *    noted for bundling its icon. Auto-download isn't attempted for it.
 *  - RetroArch's GitHub releases are changelog/source markers, not where its
 *    binaries are published (those come from libretro's own buildbot); there
 *    is no reliable release-asset convention to key off of.
 */

export type EmulatorPlatform = 'win32' | 'darwin' | 'linux'

/**
 * How to fetch a ready-to-run copy of this emulator for one platform, so the
 * "add emulator" picker can offer an "Install" button instead of requiring
 * the user to already have it on disk. Only emulators that are open-source
 * and actually publish per-platform build artifacts as GitHub release
 * assets get one of these - see the comment above KNOWN_EMULATORS for which
 * entries are deliberately left without.
 *
 * assetPattern is a regex rather than an exact filename because release
 * asset names embed a version number that changes every release; it's
 * matched against every asset name in the latest release and the first
 * match wins.
 */
export interface EmulatorDownloadSource {
  type: 'github-release'
  /** 'owner/repo' on GitHub. */
  repo: string
  assetPattern: Partial<Record<EmulatorPlatform, RegExp>>
  /**
   * 'zip' - extract the whole archive into the install dir, then locate the
   * binary inside via executableNames.
   * 'raw' - the asset itself is the runnable file (e.g. an AppImage); it's
   * saved as-is and marked executable.
   */
  archiveType: Partial<Record<EmulatorPlatform, 'zip' | 'raw'>>
}

export interface KnownEmulator {
  id: string
  name: string
  platforms: EmulatorPlatform[]
  defaultArgsTemplate: Partial<Record<EmulatorPlatform, string>>
  executableNames: Partial<Record<EmulatorPlatform, string[]>>
  installPaths: Partial<Record<EmulatorPlatform, string[]>>
  download?: EmulatorDownloadSource
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
    },
    download: {
      type: 'github-release',
      repo: 'simple64/simple64',
      assetPattern: {
        win32: /win(?:64|dows)?.*\.zip$/i,
        linux: /\.appimage$/i
      },
      archiveType: { win32: 'zip', linux: 'raw' }
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
    },
    download: {
      type: 'github-release',
      repo: 'Rosalie241/RMG',
      assetPattern: {
        win32: /win(?:64|dows)?.*\.zip$/i,
        linux: /\.appimage$/i
      },
      archiveType: { win32: 'zip', linux: 'raw' }
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
    },
    download: {
      type: 'github-release',
      repo: 'ares-emulator/ares',
      assetPattern: {
        win32: /win(?:dows)?.*\.zip$/i,
        darwin: /mac(?:os)?.*\.zip$/i,
        linux: /linux.*\.zip$/i
      },
      archiveType: { win32: 'zip', darwin: 'zip', linux: 'zip' }
    }
  }
]

export function getKnownEmulator(id: string): KnownEmulator | undefined {
  return KNOWN_EMULATORS.find((e) => e.id === id)
}
