/**
 * Shared IPC contract between main and renderer, imported by both sides so
 * channel names and payload shapes can't drift out of sync.
 */

export type RomVariant = 'compressed' | 'byteswap-compressed' | 'decompressed'

export const IpcChannel = {
  RomSelectFile: 'rom:select-file',
  RomVerify: 'rom:verify',
  RomConfirm: 'rom:confirm',
  RomGetConfig: 'rom:get-config',
  EmulatorList: 'emulator:list',
  EmulatorSelectExecutable: 'emulator:select-executable',
  EmulatorAdd: 'emulator:add',
  EmulatorUpdate: 'emulator:update',
  EmulatorDelete: 'emulator:delete',
  EmulatorSetDefault: 'emulator:set-default'
} as const

export interface RomVerification {
  verified: boolean
  variant: RomVariant | null
  headerCrcHex: string
}

export interface RomConfig {
  romPath: string | null
  romVariant: RomVariant | null
  romVerified: boolean
  romUserConfirmed: boolean
  updatedAt: number | null
}

export interface RomConfirmRequest {
  romPath: string
  variant: RomVariant | null
  verified: boolean
}

export interface Emulator {
  id: number
  name: string
  executablePath: string
  argsTemplate: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface EmulatorInput {
  name: string
  executablePath: string
  argsTemplate: string
}

export interface EmulatorValidationError {
  field: 'name' | 'executablePath' | 'argsTemplate'
  message: string
}

export interface EmulatorSaveResult {
  emulator: Emulator | null
  errors: EmulatorValidationError[]
}
