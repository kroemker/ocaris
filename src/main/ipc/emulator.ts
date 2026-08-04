import { dialog, ipcMain } from 'electron'
import { IpcChannel, type Emulator, type EmulatorInput, type EmulatorSaveResult } from '@shared/ipc'
import {
  addEmulator,
  deleteEmulator,
  listEmulators,
  setDefaultEmulator,
  updateEmulator
} from '../db/emulators'
import { getDatabase } from '../db'
import { validateExecutablePath } from '../emulator/validate'
import { validateEmulatorInput } from '../emulator/validateInput'

async function validateAndSave(
  input: EmulatorInput,
  save: () => Emulator
): Promise<EmulatorSaveResult> {
  const pathValidation = await validateExecutablePath(input.executablePath)
  const errors = validateEmulatorInput(input, pathValidation)
  if (errors.length > 0) {
    return { emulator: null, errors }
  }
  return { emulator: save(), errors: [] }
}

export function registerEmulatorIpcHandlers(): void {
  ipcMain.handle(IpcChannel.EmulatorList, (): Emulator[] => {
    return listEmulators(getDatabase())
  })

  ipcMain.handle(IpcChannel.EmulatorSelectExecutable, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Select emulator executable',
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Executable', extensions: ['exe'] }]
          : [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IpcChannel.EmulatorAdd,
    async (_event, input: EmulatorInput): Promise<EmulatorSaveResult> => {
      const db = getDatabase()
      return validateAndSave(input, () => addEmulator(db, input))
    }
  )

  ipcMain.handle(
    IpcChannel.EmulatorUpdate,
    async (_event, id: number, input: EmulatorInput): Promise<EmulatorSaveResult> => {
      const db = getDatabase()
      return validateAndSave(input, () => updateEmulator(db, id, input))
    }
  )

  ipcMain.handle(IpcChannel.EmulatorDelete, (_event, id: number): void => {
    deleteEmulator(getDatabase(), id)
  })

  ipcMain.handle(IpcChannel.EmulatorSetDefault, (_event, id: number): void => {
    setDefaultEmulator(getDatabase(), id)
  })
}
