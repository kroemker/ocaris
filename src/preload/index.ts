import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type AppPingResponse } from '@shared/ipc'

const api = {
  ping: (): Promise<AppPingResponse> => ipcRenderer.invoke(IpcChannel.AppPing)
}

export type OcarisApi = typeof api

contextBridge.exposeInMainWorld('api', api)
