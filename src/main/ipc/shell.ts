import { ipcMain, shell } from 'electron'
import { IpcChannel } from '@shared/ipc'

export function registerShellIpcHandlers(): void {
  ipcMain.handle(IpcChannel.ShellOpenExternal, async (_event, url: string): Promise<void> => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Refusing to open a non-http(s) URL.')
    }
    await shell.openExternal(url)
  })
}
