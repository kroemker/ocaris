import type { UpdateStatus } from '@shared/ipc'
import { formatBytes } from './library'

/**
 * What the update section says and offers, given a status. Kept free of React
 * so the whole state machine can be covered without a DOM, like library.ts.
 */

export type UpdateActionId = 'check' | 'download' | 'install'

export interface UpdateView {
  /** The line the About pane leads with. */
  headline: string
  /** Second line, when there is more to say. */
  detail: string | null
  action: { id: UpdateActionId; label: string; primary: boolean } | null
  /** Whether the action is a no-op right now (a check already running). */
  busy: boolean
  showProgress: boolean
  /** True when the state is worth interrupting the library for. */
  banner: boolean
}

export function updateView(status: UpdateStatus, currentVersion: string | null): UpdateView {
  const version = status.version ?? 'a new version'

  switch (status.state) {
    case 'unsupported':
      return {
        headline: 'Updates are handled outside the app',
        detail: status.message,
        action: null,
        busy: false,
        showProgress: false,
        banner: false
      }

    case 'checking':
      return {
        headline: 'Checking for updates…',
        detail: null,
        action: { id: 'check', label: 'Check for updates', primary: false },
        busy: true,
        showProgress: false,
        banner: false
      }

    case 'available':
      return {
        headline: `Ocaris ${version} is available`,
        detail: status.releaseNotes,
        action: { id: 'download', label: 'Download update', primary: true },
        busy: false,
        showProgress: false,
        banner: false
      }

    case 'downloading':
      return {
        headline: `Downloading Ocaris ${version}…`,
        detail: formatTransfer(status),
        action: null,
        busy: true,
        showProgress: true,
        banner: false
      }

    case 'ready':
      return {
        headline: `Ocaris ${version} is ready to install`,
        detail: 'It will be applied the next time you quit, or restart now.',
        action: { id: 'install', label: 'Restart and install', primary: true },
        busy: false,
        showProgress: false,
        banner: true
      }

    case 'error':
      return {
        headline: "Couldn't check for updates",
        detail: status.message,
        action: { id: 'check', label: 'Try again', primary: false },
        busy: false,
        showProgress: false,
        banner: false
      }

    case 'idle':
      return {
        headline: currentVersion ? `Ocaris ${currentVersion} is up to date` : 'Up to date',
        detail: null,
        action: { id: 'check', label: 'Check for updates', primary: false },
        busy: false,
        showProgress: false,
        banner: false
      }
  }
}

/** "42.1 MB of 110.1 MB", or just the percentage when no total was sent. */
function formatTransfer(status: UpdateStatus): string | null {
  if (status.transferredBytes === null) return null
  if (status.totalBytes === null) return formatBytes(status.transferredBytes)
  return `${formatBytes(status.transferredBytes)} of ${formatBytes(status.totalBytes)}`
}
