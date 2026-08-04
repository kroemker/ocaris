import { dialog, ipcMain } from 'electron'
import {
  IpcChannel,
  type RomConfig,
  type RomConfirmRequest,
  type RomVerification
} from '@shared/ipc'
import { getAppConfig, saveRomConfig } from '../db/appConfig'
import { getDatabase } from '../db'
import { verifyRomFile } from '../rom/verify'

export function registerRomIpcHandlers(): void {
  ipcMain.handle(IpcChannel.RomSelectFile, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select your Ocarina of Time ROM',
      properties: ['openFile'],
      filters: [
        { name: 'N64 ROM', extensions: ['z64', 'n64', 'v64'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IpcChannel.RomVerify,
    async (_event, filePath: string): Promise<RomVerification> => {
      return verifyRomFile(filePath)
    }
  )

  ipcMain.handle(IpcChannel.RomConfirm, (_event, input: RomConfirmRequest): RomConfig => {
    const db = getDatabase()
    return saveRomConfig(db, {
      romPath: input.romPath,
      romVariant: input.variant,
      romVerified: input.verified,
      romUserConfirmed: true
    })
  })

  ipcMain.handle(IpcChannel.RomGetConfig, (): RomConfig => {
    const db = getDatabase()
    return getAppConfig(db)
  })
}
