import { registerRomIpcHandlers } from './rom'
import { registerEmulatorIpcHandlers } from './emulator'

export function registerIpcHandlers(): void {
  registerRomIpcHandlers()
  registerEmulatorIpcHandlers()
}
