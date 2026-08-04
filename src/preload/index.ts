import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type Emulator,
  type EmulatorInput,
  type EmulatorSaveResult,
  type RomConfig,
  type RomConfirmRequest,
  type RomVerification
} from '@shared/ipc'

const api = {
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
      ipcRenderer.invoke(IpcChannel.EmulatorLaunch, emulatorId, romPath)
  }
}

export type OcarisApi = typeof api

contextBridge.exposeInMainWorld('api', api)
