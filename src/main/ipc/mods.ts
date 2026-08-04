import { ipcMain, shell } from 'electron'
import { rm } from 'node:fs/promises'
import { IpcChannel } from '@shared/ipc'
import { getDatabase } from '../db'
import { getModWithStatus, setModStatus } from '../db/mods'

/**
 * In-flight installs, keyed by mod id, so mod:cancel can abort one download
 * without touching the others. Downloads are deliberately uncapped - several
 * mods can be installing at once, and each gets its own controller.
 */
const inFlight = new Map<string, AbortController>()

export function beginInstall(modId: string): AbortController {
  // A second install of the same mod supersedes the first.
  inFlight.get(modId)?.abort()
  const controller = new AbortController()
  inFlight.set(modId, controller)
  return controller
}

export function endInstall(modId: string, controller: AbortController): void {
  // Only clear our own entry: a newer install may already have replaced it.
  if (inFlight.get(modId) === controller) inFlight.delete(modId)
}

async function removeIfPresent(path: string | null): Promise<void> {
  if (!path) return
  // A file the user already deleted is not an error - the point is that it's
  // gone, and the status reset below has to happen either way.
  await rm(path, { force: true }).catch(() => undefined)
}

export function registerModIpcHandlers(): void {
  // Takes a mod id rather than a path: the renderer never gets to name a
  // filesystem location for the app to open.
  ipcMain.handle(IpcChannel.ModReveal, (_event, modId: string): void => {
    const mod = getModWithStatus(getDatabase(), modId)
    const path = mod?.status.patchedRomPath
    if (!path) throw new Error(`Mod ${modId} has no patched ROM to show`)
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IpcChannel.ModRemove, async (_event, modId: string): Promise<void> => {
    const db = getDatabase()
    const mod = getModWithStatus(db, modId)
    if (!mod) throw new Error(`Mod ${modId} not found`)

    await removeIfPresent(mod.status.patchedRomPath)
    await removeIfPresent(mod.status.patchFilePath)

    setModStatus(db, modId, {
      state: 'not_downloaded',
      patchFilePath: null,
      patchedRomPath: null,
      downloadProgressBytes: null,
      downloadTotalBytes: null,
      errorMessage: null
    })
  })

  ipcMain.handle(IpcChannel.ModCancel, (_event, modId: string): boolean => {
    const controller = inFlight.get(modId)
    if (!controller) return false
    // installMod maps the abort to a 'not_downloaded' status itself; nothing
    // to write here.
    controller.abort()
    return true
  })
}
