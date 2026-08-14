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

/**
 * View state the library list is driven by. Lives in the shared contract
 * rather than the renderer because main validates it before storing it.
 */
export type LibraryFilter = 'all' | 'ready' | 'downloading' | 'available' | 'error' | 'favorites'

export type LibrarySort = 'name' | 'author' | 'status' | 'recent'

export type SettingsPane = 'appearance' | 'rom' | 'emulators' | 'catalog' | 'storage' | 'about'

export interface LibraryPrefs {
  filter: LibraryFilter
  sort: LibrarySort
  groupByState: boolean
  query: string
}

/** Everything about the renderer's presentation that survives a restart. */
export interface UiState {
  library: LibraryPrefs
  /** Which pane the gear button opens. */
  settingsPane: SettingsPane
}

/**
 * Where the window was when it was last closed. Written by main on window
 * events, never through the renderer, so it is not part of AppSettings.
 * x/y are null when the position is unknown or unusable, which leaves the
 * placement to Electron.
 */
export interface WindowBounds {
  x: number | null
  y: number | null
  width: number
  height: number
  maximized: boolean
}

export const IpcChannel = {
  ConfigGet: 'config:get',
  ConfigSetTheme: 'config:set-theme',
  ConfigSetUiState: 'config:set-ui-state',
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
  ModSetPrefs: 'mod:set-prefs',
  /** main -> renderer, unlike every other channel here. */
  ModProgress: 'mod:progress',
  UpdateGetStatus: 'update:get-status',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateInstall: 'update:install',
  /** main -> renderer, like mod:progress. */
  UpdateStatus: 'update:status',
  StorageUsage: 'storage:usage',
  StorageOpenFolder: 'storage:open-folder',
  StorageSelectFolder: 'storage:select-folder',
  StorageSetLocation: 'storage:set-location',
  ShellOpenExternal: 'shell:open-external'
} as const

export interface AppSettings {
  theme: ThemeSource
  uiState: UiState
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

/**
 * Per-mod choices the user made, kept apart from ModStatusSummary because they
 * outlive it: removing a patched ROM resets the status, and a favourite or a
 * remembered emulator has to survive that.
 */
export interface ModPrefs {
  favorite: boolean
  /** Legacy: the library no longer offers a way to hide a mod, but the column
   *  outlives the feature so older rows still read back. */
  hidden: boolean
  /** Emulator to launch this mod with, overriding the global default. Null
   *  means "whatever the default is", which is also what a deleted emulator
   *  falls back to. */
  emulatorId: number | null
}

export type ModPrefsPatch = Partial<ModPrefs>

/** A catalog a mod row came from. Merged rows list more than one. */
export interface ModSourceSummary {
  source: string
  pageUrl: string | null
}

export interface ModSummary {
  id: string
  source: string
  name: string
  author: string | null
  description: string | null
  thumbnailUrl: string | null
  downloadLink: string | null
  /**
   * Whether downloadLink is something the installer can act on. Most of the
   * wiki's links are MediaFire/Drive/Discord landing pages, so those rows
   * offer the mod page instead of a Download button that could only fail.
   */
  installable: boolean
  /** Where "Open page" goes: the mod's own page, not its download link. */
  pageUrl: string | null
  completionStatus: string | null
  sources: ModSourceSummary[]
  /** When this mod first appeared in a refresh, which is what "recently added"
   *  sorts on. Null only for rows that predate the column's backfill. */
  firstSeenAt: number | null
  status: ModStatusSummary
  prefs: ModPrefs
}

/**
 * Pushed while a mod downloads, so the list doesn't have to poll for progress.
 * Carries the status fields that move, not a whole ModSummary: nothing else
 * about the row can change mid-download.
 */
export interface ModProgressEvent {
  modId: string
  downloadProgressBytes: number
  downloadTotalBytes: number | null
}

/**
 * Where the app is in an update. One union for the renderer rather than the
 * seven events electron-updater emits, because the UI only ever asks "what
 * should this pane say and which button does it offer".
 *
 * 'unsupported' is its own state, not an error: a dev run and (for now) macOS
 * genuinely cannot update, and saying so beats a button that fails.
 */
export type UpdateState =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** The version this is about: the one available, downloading or ready. */
  version: string | null
  /** Release notes of that version, plain text, only once one is known. */
  releaseNotes: string | null
  /** 0-100 while downloading, null otherwise. */
  percent: number | null
  transferredBytes: number | null
  totalBytes: number | null
  /** Set for 'error', and for 'unsupported' where it explains why. */
  message: string | null
}

export interface CatalogSourceResult {
  source: string
  /** Mods contributed before merging; null when the source failed. */
  count: number | null
  errorMessage: string | null
}

export interface CatalogRefreshResult {
  count: number
  refreshedAt: number
  sources: CatalogSourceResult[]
}
