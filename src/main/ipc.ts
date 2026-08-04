import { ipcMain } from 'electron'
import { IpcChannel, type AppPingResponse } from '@shared/ipc'
import { getDbPath } from './db'

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.AppPing, (): AppPingResponse => {
    return {
      message: 'pong',
      dbPath: getDbPath(),
      timestamp: Date.now()
    }
  })
}
