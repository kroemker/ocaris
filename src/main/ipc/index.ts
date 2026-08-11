import { registerConfigIpcHandlers } from './config'
import { registerRomIpcHandlers } from './rom'
import { registerEmulatorIpcHandlers } from './emulator'
import { registerCatalogIpcHandlers } from './catalog'
import { registerModIpcHandlers } from './mods'
import { registerShellIpcHandlers } from './shell'
import { registerStorageIpcHandlers } from './storage'
import { registerUpdateIpcHandlers } from './update'

export function registerIpcHandlers(): void {
  registerConfigIpcHandlers()
  registerRomIpcHandlers()
  registerEmulatorIpcHandlers()
  registerCatalogIpcHandlers()
  registerModIpcHandlers()
  registerStorageIpcHandlers()
  registerShellIpcHandlers()
  registerUpdateIpcHandlers()
}
