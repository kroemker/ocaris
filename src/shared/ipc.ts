/**
 * Shared IPC contract between main and renderer, imported by both sides so
 * channel names and payload shapes can't drift out of sync.
 */

export const IpcChannel = {
  AppPing: 'app:ping'
} as const

export interface AppPingResponse {
  message: string
  dbPath: string
  timestamp: number
}
