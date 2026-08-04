import { registerRomIpcHandlers } from './rom'
import { registerEmulatorIpcHandlers } from './emulator'
import { registerCatalogIpcHandlers } from './catalog'
import { registerShellIpcHandlers } from './shell'

export function registerIpcHandlers(): void {
  registerRomIpcHandlers()
  registerEmulatorIpcHandlers()
  registerCatalogIpcHandlers()
  registerShellIpcHandlers()
}
