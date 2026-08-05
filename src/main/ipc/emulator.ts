import { dialog, ipcMain } from 'electron'
import {
  IpcChannel,
  type DetectedEmulator,
  type Emulator,
  type EmulatorInput,
  type EmulatorInstallResult,
  type EmulatorSaveResult
} from '@shared/ipc'
import {
  addEmulator,
  deleteEmulator,
  listEmulators,
  setDefaultEmulator,
  updateEmulator
} from '../db/emulators'
import { getDatabase } from '../db'
import { currentPlatform, detectEmulators } from '../emulator/detect'
import { installKnownEmulator } from '../emulator/install'
import { launchEmulator } from '../emulator/launch'
import { validateExecutablePath } from '../emulator/validate'
import { validateEmulatorInput } from '../emulator/validateInput'
import { getEmulatorInstallDir } from '../storage/paths'

interface InFlightInstall {
  controller: AbortController
  promise: Promise<EmulatorInstallResult>
}

/**
 * In-flight installs, keyed by known emulator id, so emulator:install-cancel
 * can abort one without touching others. Unlike src/main/ipc/mods.ts's
 * inFlight map, a second call for an id already installing joins the same
 * promise instead of superseding it: installKnownEmulator wipes its whole
 * target directory at the start of a run and again on abort, so two
 * concurrent runs for the same id (which would also race on the same
 * download filename, since both resolve the same "latest release") could
 * otherwise delete each other's in-progress work.
 */
const inFlightInstalls = new Map<string, InFlightInstall>()

/** True while any known emulator is mid-download, so a storage relocation
 *  can refuse to move files out from under a write in progress. */
export function hasActiveEmulatorInstalls(): boolean {
  return inFlightInstalls.size > 0
}

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

  ipcMain.handle(IpcChannel.EmulatorDetect, async (): Promise<DetectedEmulator[]> => {
    const existingPaths = listEmulators(getDatabase()).map((e) => e.executablePath)
    return detectEmulators(existingPaths)
  })

  ipcMain.handle(
    IpcChannel.EmulatorLaunch,
    async (_event, emulatorId: number, romPath: string): Promise<void> => {
      const emulator = listEmulators(getDatabase()).find((e) => e.id === emulatorId)
      if (!emulator) {
        throw new Error(`Emulator ${emulatorId} not found`)
      }
      await launchEmulator(emulator.executablePath, emulator.argsTemplate, romPath)
    }
  )

  ipcMain.handle(
    IpcChannel.EmulatorInstall,
    (_event, knownId: string): Promise<EmulatorInstallResult> => {
      const existing = inFlightInstalls.get(knownId)
      if (existing) return existing.promise

      const platform = currentPlatform()
      if (!platform) {
        return Promise.resolve({
          ok: false,
          executablePath: null,
          errorMessage: 'Unsupported platform.'
        })
      }

      const controller = new AbortController()
      const promise = installKnownEmulator({
        knownId,
        platform,
        installDir: getEmulatorInstallDir(getDatabase()),
        signal: controller.signal
      }).finally(() => inFlightInstalls.delete(knownId))

      inFlightInstalls.set(knownId, { controller, promise })
      return promise
    }
  )

  ipcMain.handle(IpcChannel.EmulatorInstallCancel, (_event, knownId: string): boolean => {
    const existing = inFlightInstalls.get(knownId)
    if (!existing) return false
    existing.controller.abort()
    return true
  })
}
