import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type AppSettings,
  type CatalogRefreshResult,
  type CatalogStats,
  type DetectedEmulator,
  type Emulator,
  type EmulatorInput,
  type EmulatorSaveResult,
  type ModSummary,
  type RomConfig,
  type RomConfirmRequest,
  type RomVerification,
  type StorageUsage,
  type ThemeSource
} from '@shared/ipc'

const api = {
  config: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IpcChannel.ConfigGet),
    setTheme: (theme: ThemeSource): Promise<AppSettings> =>
      ipcRenderer.invoke(IpcChannel.ConfigSetTheme, theme)
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
    detect: (): Promise<DetectedEmulator[]> => ipcRenderer.invoke(IpcChannel.EmulatorDetect)
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
    reveal: (modId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.ModReveal, modId)
  },
  storage: {
    usage: (): Promise<StorageUsage> => ipcRenderer.invoke(IpcChannel.StorageUsage),
    openFolder: (): Promise<void> => ipcRenderer.invoke(IpcChannel.StorageOpenFolder)
  },
  shell: {
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url)
  }
}

export type OcarisApi = typeof api

contextBridge.exposeInMainWorld('api', api)
