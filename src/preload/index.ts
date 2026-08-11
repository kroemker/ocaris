import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  type AppSettings,
  type CatalogRefreshResult,
  type CatalogStats,
  type DetectedEmulator,
  type Emulator,
  type EmulatorInput,
  type EmulatorInstallResult,
  type EmulatorSaveResult,
  type ModPrefs,
  type ModPrefsPatch,
  type ModProgressEvent,
  type ModSummary,
  type RomConfig,
  type RomConfirmRequest,
  type RomVerification,
  type StorageUsage,
  type ThemeSource,
  type UiState
} from '@shared/ipc'

const api = {
  config: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.ConfigGet),
    setTheme: (theme: ThemeSource): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannel.ConfigSetTheme, theme),
    setUiState: (uiState: UiState): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannel.ConfigSetUiState, uiState)
  },
  rom: {
    selectFile: (): Promise<string | null> => ipcRenderer.invoke(IpcChannel.RomSelectFile),
    verify: (filePath: string): Promise<RomVerification> =>
      ipcRenderer.invoke(IpcChannel.RomVerify, filePath),
    confirm: (input: RomConfirmRequest): Promise<RomConfig> =>
      ipcRenderer.invoke(IpcChannel.RomConfirm, input),
    getConfig: (): Promise<RomConfig> => ipcRenderer.invoke(IpcChannel.RomGetConfig)
  },
  emulator: {
    list: (): Promise<Emulator[]> => ipcRenderer.invoke(IpcChannel.EmulatorList),
    selectExecutable: (): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannel.EmulatorSelectExecutable),
    add: (input: EmulatorInput): Promise<EmulatorSaveResult> =>
      ipcRenderer.invoke(IpcChannel.EmulatorAdd, input),
    update: (id: number, input: EmulatorInput): Promise<EmulatorSaveResult> =>
      ipcRenderer.invoke(IpcChannel.EmulatorUpdate, id, input),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IpcChannel.EmulatorDelete, id),
    setDefault: (id: number): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.EmulatorSetDefault, id),
    launch: (emulatorId: number, romPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.EmulatorLaunch, emulatorId, romPath),
    detect: (): Promise<DetectedEmulator[]> => ipcRenderer.invoke(IpcChannel.EmulatorDetect),
    install: (knownId: string): Promise<EmulatorInstallResult> =>
      ipcRenderer.invoke(IpcChannel.EmulatorInstall, knownId),
    installCancel: (knownId: string): Promise<boolean> =>
      ipcRenderer.invoke(IpcChannel.EmulatorInstallCancel, knownId)
  },
  catalog: {
    refresh: (): Promise<CatalogRefreshResult> => ipcRenderer.invoke(IpcChannel.CatalogRefresh),
    list: (): Promise<ModSummary[]> => ipcRenderer.invoke(IpcChannel.CatalogList),
    stats: (): Promise<CatalogStats> => ipcRenderer.invoke(IpcChannel.CatalogStats),
    install: (modId: string): Promise<ModSummary> =>
      ipcRenderer.invoke(IpcChannel.ModInstall, modId)
  },
  mod: {
    /** Resolves true if a download was in flight and has been aborted. */
    cancel: (modId: string): Promise<boolean> => ipcRenderer.invoke(IpcChannel.ModCancel, modId),
    remove: (modId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModRemove, modId),
    reveal: (modId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModReveal, modId),
    setPrefs: (modId: string, patch: ModPrefsPatch): Promise<ModPrefs> =>
      ipcRenderer.invoke(IpcChannel.ModSetPrefs, modId, patch),
    /**
     * Download progress, pushed while an install runs. Returns its own
     * unsubscribe: removeListener needs the exact function that was added, and
     * the renderer never sees the wrapper this side registers.
     */
    onProgress: (listener: (progress: ModProgressEvent) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, progress: ModProgressEvent): void =>
        listener(progress)
      ipcRenderer.on(IpcChannel.ModProgress, handler)
      return () => ipcRenderer.removeListener(IpcChannel.ModProgress, handler)
    }
  },
  storage: {
    usage: (): Promise<StorageUsage> => ipcRenderer.invoke(IpcChannel.StorageUsage),
    openFolder: (): Promise<void> => ipcRenderer.invoke(IpcChannel.StorageOpenFolder),
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannel.StorageSelectFolder),
    setLocation: (path: string | null): Promise<StorageUsage> =>
      ipcRenderer.invoke(IpcChannel.StorageSetLocation, path)
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url)
  }
}

export type OcarisApi = typeof api

contextBridge.exposeInMainWorld('api', api)
