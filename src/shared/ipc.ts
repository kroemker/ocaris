/**
 * Shared IPC contract between main and renderer, imported by both sides so
 * channel names and payload shapes can't drift out of sync.
 */

export type RomVariant = 'compressed' | 'byteswap-compressed' | 'decompressed'

export const IpcChannel = {
  RomSelectFile: 'rom:select-file',
  RomVerify: 'rom:verify',
  RomConfirm: 'rom:confirm',
  RomGetConfig: 'rom:get-config'
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
