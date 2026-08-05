import { dialog, ipcMain } from 'electron'
import {
  IpcChannel,
  type RomConfig,
  type RomConfirmRequest,
  type RomVerification
} from '@shared/ipc'
import { getAppConfig, saveRomConfig } from '../db/appConfig'
import { getDatabase } from '../db'
import { copyBaseRom } from '../rom/baseRom'
import { verifyRomFile } from '../rom/verify'
import { getBaseRomDir } from '../storage/paths'

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

  ipcMain.handle(
    IpcChannel.RomConfirm,
    async (_event, input: RomConfirmRequest): Promise<RomConfig> => {
      const db = getDatabase()
      // Every patch is applied to this managed copy, not the path the user
      // picked - so renaming or moving the original afterwards can't break
      // an install that's already configured.
      const managedPath = await copyBaseRom(input.romPath, getBaseRomDir(db))
      return saveRomConfig(db, {
        romPath: managedPath,
        romVariant: input.variant,
        romVerified: input.verified,
        romUserConfirmed: true
      })
    }
  )

  ipcMain.handle(IpcChannel.RomGetConfig, (): RomConfig => {
    const db = getDatabase()
    return getAppConfig(db)
  })
}
