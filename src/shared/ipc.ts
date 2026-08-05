/**
 * Shared IPC contract between main and renderer, imported by both sides so
 * channel names and payload shapes can't drift out of sync.
 */

export type RomVariant = 'compressed' | 'byteswap-compressed' | 'decompressed'

/**
 * Theme preference as stored. 'system' defers to the OS, which Electron
 * surfaces to the renderer through prefers-color-scheme.
 */
export type ThemeSource = 'system' | 'light' | 'dark'

export const IpcChannel = {
  ConfigGet: 'config:get',
  ConfigSetTheme: 'config:set-theme',
  RomSelectFile: 'rom:select-file',
  RomVerify: 'rom:verify',
  RomConfirm: 'rom:confirm',
  RomGetConfig: 'rom:get-config',
  EmulatorList: 'emulator:list',
  EmulatorSelectExecutable: 'emulator:select-executable',
  EmulatorAdd: 'emulator:add',
  EmulatorUpdate: 'emulator:update',
  EmulatorDelete: 'emulator:delete',
  EmulatorSetDefault: 'emulator:set-default',
  EmulatorLaunch: 'emulator:launch',
  EmulatorDetect: 'emulator:detect',
  EmulatorInstall: 'emulator:install',
  EmulatorInstallCancel: 'emulator:install-cancel',
  CatalogRefresh: 'catalog:refresh',
  CatalogList: 'catalog:list',
  CatalogStats: 'catalog:stats',
  ModInstall: 'mod:install',
  ModCancel: 'mod:cancel',
  ModRemove: 'mod:remove',
  ModReveal: 'mod:reveal',
  StorageUsage: 'storage:usage',
  StorageOpenFolder: 'storage:open-folder',
  StorageSelectFolder: 'storage:select-folder',
  StorageSetLocation: 'storage:set-location',
  ShellOpenExternal: 'shell:open-external'
} as const

export interface AppSettings {
  theme: ThemeSource
  appVersion: string
  platform: NodeJS.Platform
}

export interface CatalogStats {
  count: number
  refreshedAt: number | null
}

export interface StorageUsage {
  storageRoot: string
  /** True when storageRoot is the app's default userData location. */
  isDefaultLocation: boolean
  patchedRomDir: string
  fileCount: number
  totalBytes: number
}

export interface RomVerification {
  verified: boolean
  variant: RomVariant | null
  headerCrcHex: string
}

export interface RomConfig {
  romPath: string | null
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
  updatedAt: number | null
}

export interface RomConfirmRequest {
  romPath: string
  variant: RomVariant | null
  verified: boolean
}

export type EmulatorKind = 'known' | 'custom'

export interface Emulator {
  id: number
  name: string
  executablePath: string
  argsTemplate: string
  isDefault: boolean
  knownId: string | null
  kind: EmulatorKind
  createdAt: number
  updatedAt: number
}

export interface EmulatorInput {
  name: string
  executablePath: string
  argsTemplate: string
  knownId?: string | null
}

export interface EmulatorValidationError {
  field: 'name' | 'executablePath' | 'argsTemplate'
  message: string
}

export interface EmulatorSaveResult {
  emulator: Emulator | null
  errors: EmulatorValidationError[]
}

export interface DetectedEmulator {
  knownId: string
  executablePath: string
}

export interface EmulatorInstallResult {
  ok: boolean
  executablePath: string | null
  errorMessage: string | null
}

export type ModStatusState = 'not_downloaded' | 'downloading' | 'ready' | 'error'

export interface ModStatusSummary {
  state: ModStatusState
  patchedRomPath: string | null
  downloadProgressBytes: number | null
  downloadTotalBytes: number | null
  errorMessage: string | null
}

export interface ModSummary {
  id: string
  source: string
  name: string
  author: string | null
  description: string | null
  thumbnailUrl: string | null
  downloadLink: string | null
  completionStatus: string | null
  status: ModStatusSummary
}

export interface CatalogRefreshResult {
  source: string
  count: number
  refreshedAt: number
}
