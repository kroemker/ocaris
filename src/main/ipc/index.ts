import { registerConfigIpcHandlers } from './config'
import { registerRomIpcHandlers } from './rom'
import { registerEmulatorIpcHandlers } from './emulator'
import { registerCatalogIpcHandlers } from './catalog'
import { registerShellIpcHandlers } from './shell'
import { registerStorageIpcHandlers } from './storage'

export function registerIpcHandlers(): void {
  registerConfigIpcHandlers()
  registerRomIpcHandlers()
  registerEmulatorIpcHandlers()
  registerCatalogIpcHandlers()
  registerStorageIpcHandlers()
  registerShellIpcHandlers()
}
