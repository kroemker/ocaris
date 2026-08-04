import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
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
  }
}

export type OcarisApi = typeof api

contextBridge.exposeInMainWorld('api', api)
