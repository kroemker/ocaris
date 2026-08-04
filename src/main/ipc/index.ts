import { registerRomIpcHandlers } from './rom'
import { registerEmulatorIpcHandlers } from './emulator'
import { registerCatalogIpcHandlers } from './catalog'

export function registerIpcHandlers(): void {
  registerRomIpcHandlers()
  registerEmulatorIpcHandlers()
  registerCatalogIpcHandlers()
}
