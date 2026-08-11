import type { UpdateStatus } from '@shared/ipc'
import { PROGRESS_EMIT_INTERVAL_MS, throttle } from '../util/throttle'

/**
 * The slice of electron-updater's autoUpdater this uses, so the service can be
 * driven by a fake in tests - the real one reaches for the network, the app's
 * packaging metadata and, on quitAndInstall, the process itself.
 */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: (...args: never[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

/** Shapes electron-updater hands to its listeners, narrowed to what is used. */
interface UpdateInfoLike {
  version?: string
  releaseNotes?: string | { note?: string }[] | null
}

interface ProgressLike {
  percent?: number
  transferred?: number
  total?: number
}

export interface UpdateServiceOptions {
  updater: UpdaterLike
  /**
   * False where updating cannot work: a dev run (there is no installed app to
   * replace) or an unsigned macOS build (Squirrel.Mac refuses it). The reason
   * is shown to the user, so it has to read as an explanation.
   */
  supported: boolean
  unsupportedReason?: string
  /** Called on every state change, already throttled for download progress. */
  onStatus: (status: UpdateStatus) => void
}

export interface UpdateService {
  getStatus(): UpdateStatus
  /** Resolves once the check has been *started* - the outcome arrives as a
   *  status change, since that is also how an unprompted check reports. */
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  install(): void
}

const IDLE: UpdateStatus = {
  state: 'idle',
  version: null,
  releaseNotes: null,
  percent: null,
  transferredBytes: null,
  totalBytes: null,
  message: null
}

/**
 * electron-updater's release notes are a string for some providers and an
 * array of {version, note} for others; GitHub gives the release body. Only
 * plain text is ever shown, so anything else collapses to null rather than
 * risking markup in the UI.
 */
export function plainReleaseNotes(notes: UpdateInfoLike['releaseNotes']): string | null {
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => entry?.note ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim()
    return joined || null
  }
  return null
}

/**
 * Why this build can't update itself, or null when it can. Pure, and here
 * rather than next to the Electron wiring, so it can be tested without an
 * Electron runtime.
 */
export function unsupportedReason(packaged: boolean, platform: NodeJS.Platform): string | null {
  if (!packaged) {
    return 'This is a development build. Updates only apply to an installed copy.'
  }
  if (platform === 'darwin') {
    // Squirrel.Mac refuses an update that isn't signed with a Developer ID
    // certificate, which Ocaris doesn't have yet (see docs/app-update-plan.md).
    return 'macOS builds are not signed yet, so they cannot update themselves. Download the latest release from GitHub.'
  }
  return null
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Something went wrong while updating.'
}

/**
 * Turns electron-updater's event stream into one state machine, and refuses to
 * touch the network at all where updating cannot work.
 *
 * Nothing here throws: a machine that is offline when the app launches must
 * produce a quiet 'error' status, not an unhandled rejection or a dialog.
 */
export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  const { updater, supported, onStatus } = options

  let status: UpdateStatus = supported
    ? IDLE
    : {
        ...IDLE,
        state: 'unsupported',
        message: options.unsupportedReason ?? 'Updates are not available in this build.'
      }

  function set(next: Partial<UpdateStatus>): UpdateStatus {
    status = { ...status, ...next }
    onStatus(status)
    return status
  }

  if (supported) {
    // The user consents to the download: pulling ~100 MB in the background on
    // a metered connection is not a decision to make for them.
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true

    const emitProgress = throttle<ProgressLike>((progress) => {
      set({
        state: 'downloading',
        percent: progress.percent === undefined ? null : Math.round(progress.percent),
        transferredBytes: progress.transferred ?? null,
        totalBytes: progress.total ?? null
      })
    }, PROGRESS_EMIT_INTERVAL_MS)

    updater.on('checking-for-update', () => set({ state: 'checking', message: null }))

    updater.on('update-available', (info: UpdateInfoLike) =>
      set({
        state: 'available',
        version: info?.version ?? null,
        releaseNotes: plainReleaseNotes(info?.releaseNotes),
        message: null
      })
    )

    // Back to idle, not to a "no update" state: the pane says "up to date"
    // from idle plus a last-checked time, and one fewer state is one fewer
    // thing for the UI to render.
    updater.on('update-not-available', () =>
      set({ state: 'idle', version: null, releaseNotes: null, message: null })
    )

    updater.on('download-progress', (progress: ProgressLike) => emitProgress(progress))

    updater.on('update-downloaded', (info: UpdateInfoLike) =>
      set({
        state: 'ready',
        version: info?.version ?? status.version,
        percent: 100,
        message: null
      })
    )

    updater.on('error', (error: Error) => set({ state: 'error', message: describe(error) }))
  }

  return {
    getStatus: () => status,

    async check() {
      if (!supported || status.state === 'checking' || status.state === 'downloading') {
        return status
      }
      try {
        await updater.checkForUpdates()
      } catch (error) {
        // The 'error' event usually fires too, but not for every rejection -
        // an offline machine rejects before any event is emitted.
        return set({ state: 'error', message: describe(error) })
      }
      return status
    },

    async download() {
      // Only from 'available': downloading twice would restart the transfer,
      // and there is nothing to fetch from any other state.
      if (!supported || status.state !== 'available') return status
      set({ state: 'downloading', percent: 0, transferredBytes: 0, totalBytes: null })
      try {
        await updater.downloadUpdate()
      } catch (error) {
        return set({ state: 'error', message: describe(error) })
      }
      return status
    },

    install() {
      // autoInstallOnAppQuit already covers a normal quit; this is the "restart
      // now" path, and doing it from any other state would quit the app for
      // nothing.
      if (status.state === 'ready') updater.quitAndInstall()
    }
  }
}
