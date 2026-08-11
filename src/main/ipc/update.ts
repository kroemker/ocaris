import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannel, type UpdateStatus } from '@shared/ipc'
import {
  createUpdateService,
  unsupportedReason,
  type UpdateService,
  type UpdaterLike
} from '../update/updater'

// electron-updater is CommonJS and has no named export for autoUpdater under
// the bundler's ESM interop, hence the default import and destructure.
const { autoUpdater } = electronUpdater

/**
 * Long enough that a launch isn't competing with the catalog load, the DB
 * migrations and the first paint for bandwidth and CPU; short enough that a
 * user who quits after a minute still got checked.
 */
const INITIAL_CHECK_DELAY_MS = 10_000

let service: UpdateService | undefined

/** Every open window, since an update concerns the app rather than whichever
 *  window happened to ask about it. */
function broadcast(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannel.UpdateStatus, status)
  }
}

export function registerUpdateIpcHandlers(): void {
  const reason = unsupportedReason(app.isPackaged, process.platform)

  service = createUpdateService({
    updater: autoUpdater as unknown as UpdaterLike,
    supported: reason === null,
    unsupportedReason: reason ?? undefined,
    onStatus: broadcast
  })

  ipcMain.handle(IpcChannel.UpdateGetStatus, (): UpdateStatus => service!.getStatus())
  ipcMain.handle(IpcChannel.UpdateCheck, (): Promise<UpdateStatus> => service!.check())
  ipcMain.handle(IpcChannel.UpdateDownload, (): Promise<UpdateStatus> => service!.download())
  ipcMain.handle(IpcChannel.UpdateInstall, (): void => service!.install())
}

/**
 * One check shortly after launch. Not a polling loop: a desktop app that is
 * left open for days can wait for the next launch, and the Settings pane has
 * a button for anyone who wants to ask now.
 */
export function scheduleInitialUpdateCheck(): void {
  if (!service) return
  const timer = setTimeout(() => void service?.check(), INITIAL_CHECK_DELAY_MS)
  // Must not keep the app alive on its own.
  timer.unref?.()
}
