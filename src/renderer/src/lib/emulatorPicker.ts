import type { EmulatorInput } from '@shared/ipc'
import {
  KNOWN_EMULATORS,
  type EmulatorPlatform,
  type KnownEmulator
} from '@shared/emulators/registry'

/** Known emulators that actually ship for the given OS, for the picker grid. */
export function emulatorsForPlatform(platform: EmulatorPlatform): KnownEmulator[] {
  return KNOWN_EMULATORS.filter((entry) => entry.platforms.includes(platform))
}

/**
 * Pre-fills the add/edit form from a known-emulator registry entry, whether
 * picked directly or from an auto-detect result - the form stays fully
 * editable afterward, this just saves retyping the obvious parts.
 */
export function seedFromKnown(
  entry: KnownEmulator,
  platform: EmulatorPlatform,
  executablePath = ''
): EmulatorInput {
  return {
    name: entry.name,
    executablePath,
    argsTemplate: entry.defaultArgsTemplate[platform] ?? '{romPath}',
    knownId: entry.id
  }
}
