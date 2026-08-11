import { describe, expect, it, vi } from 'vitest'
import {
  createUpdateService,
  plainReleaseNotes,
  unsupportedReason,
  type UpdaterLike
} from '../../../src/main/update/updater'
import type { UpdateStatus } from '../../../src/shared/ipc'

/** Stands in for electron-updater: records what was called and lets a test
 *  fire the events the real one would. */
function fakeUpdater(): UpdaterLike & {
  emit: (event: string, payload?: unknown) => void
  calls: string[]
} {
  const listeners = new Map<string, (payload?: unknown) => void>()
  const calls: string[] = []

  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    calls,
    on(event, listener) {
      listeners.set(event, listener as (payload?: unknown) => void)
      return this
    },
    emit(event, payload) {
      listeners.get(event)?.(payload)
    },
    checkForUpdates() {
      calls.push('check')
      return Promise.resolve({})
    },
    downloadUpdate() {
      calls.push('download')
      return Promise.resolve({})
    },
    quitAndInstall() {
      calls.push('install')
    }
  }
}

function serviceWith(supported = true): {
  updater: ReturnType<typeof fakeUpdater>
  service: ReturnType<typeof createUpdateService>
  statuses: UpdateStatus[]
} {
  const updater = fakeUpdater()
  const statuses: UpdateStatus[] = []
  const service = createUpdateService({
    updater,
    supported,
    unsupportedReason: supported ? undefined : 'no updates here',
    onStatus: (status) => statuses.push(status)
  })
  return { updater, service, statuses }
}

describe('createUpdateService', () => {
  it('starts idle and takes control of electron-updater’s automatic behaviour', () => {
    const { updater, service } = serviceWith()

    expect(service.getStatus().state).toBe('idle')
    // The user consents to the download; the install happens on quit.
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  it('walks the full check → available → download → ready path', async () => {
    const { updater, service } = serviceWith()

    await service.check()
    expect(updater.calls).toEqual(['check'])

    updater.emit('checking-for-update')
    expect(service.getStatus().state).toBe('checking')

    updater.emit('update-available', { version: '0.2.0', releaseNotes: 'Fixes things.' })
    expect(service.getStatus()).toMatchObject({
      state: 'available',
      version: '0.2.0',
      releaseNotes: 'Fixes things.'
    })

    await service.download()
    expect(updater.calls).toEqual(['check', 'download'])

    updater.emit('download-progress', { percent: 42.6, transferred: 426, total: 1000 })
    expect(service.getStatus()).toMatchObject({
      state: 'downloading',
      percent: 43,
      transferredBytes: 426,
      totalBytes: 1000
    })

    updater.emit('update-downloaded', { version: '0.2.0' })
    expect(service.getStatus()).toMatchObject({ state: 'ready', version: '0.2.0', percent: 100 })

    service.install()
    expect(updater.calls).toEqual(['check', 'download', 'install'])
  })

  it('returns to idle when there is no update', async () => {
    const { updater, service } = serviceWith()

    updater.emit('update-available', { version: '0.2.0' })
    updater.emit('update-not-available')

    expect(service.getStatus()).toMatchObject({ state: 'idle', version: null })
  })

  it('reports an error instead of rejecting when the check fails', async () => {
    const { updater, service } = serviceWith()
    updater.checkForUpdates = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))

    const status = await service.check()

    expect(status.state).toBe('error')
    expect(status.message).toBe('getaddrinfo ENOTFOUND')
  })

  it('maps an error event to the error state', () => {
    const { updater, service } = serviceWith()
    updater.emit('error', new Error('sha512 mismatch'))
    expect(service.getStatus()).toMatchObject({ state: 'error', message: 'sha512 mismatch' })
  })

  it('does nothing at all when updating is unsupported', async () => {
    const { updater, service } = serviceWith(false)

    expect(service.getStatus()).toMatchObject({ state: 'unsupported', message: 'no updates here' })

    await service.check()
    await service.download()
    service.install()

    // No network, and the automatic behaviour is left alone: nothing was wired.
    expect(updater.calls).toEqual([])
  })

  it('only downloads from available, and only installs from ready', async () => {
    const { updater, service } = serviceWith()

    // idle: nothing to download yet
    await service.download()
    service.install()
    expect(updater.calls).toEqual([])

    updater.emit('update-available', { version: '0.2.0' })
    await service.download()
    // A second request while the first is in flight must not restart it.
    await service.download()
    expect(updater.calls).toEqual(['download'])
  })

  it('does not start a second check while one is running', async () => {
    const { updater, service } = serviceWith()
    updater.emit('checking-for-update')

    await service.check()

    expect(updater.calls).toEqual([])
  })

  it('throttles download progress rather than emitting per chunk', () => {
    const { updater, statuses } = serviceWith()
    const emitted = (): number => statuses.filter((s) => s.state === 'downloading').length

    for (let i = 0; i < 50; i++) {
      updater.emit('download-progress', { percent: i, transferred: i, total: 50 })
    }

    // All 50 land inside one 200ms window, so only the leading one is sent.
    expect(emitted()).toBe(1)
  })
})

describe('plainReleaseNotes', () => {
  it('takes a string, joins the array form, and drops anything else', () => {
    expect(plainReleaseNotes('  Notes.  ')).toBe('Notes.')
    expect(plainReleaseNotes([{ note: 'One' }, { note: 'Two' }])).toBe('One\n\nTwo')
    expect(plainReleaseNotes(null)).toBeNull()
    expect(plainReleaseNotes('   ')).toBeNull()
    expect(plainReleaseNotes([])).toBeNull()
  })
})

describe('unsupportedReason', () => {
  it('rules out dev builds on every platform', () => {
    expect(unsupportedReason(false, 'win32')).toMatch(/development build/i)
    expect(unsupportedReason(false, 'darwin')).toMatch(/development build/i)
  })

  it('rules out macOS until it is signed, and allows the rest', () => {
    expect(unsupportedReason(true, 'darwin')).toMatch(/not signed/i)
    expect(unsupportedReason(true, 'win32')).toBeNull()
    expect(unsupportedReason(true, 'linux')).toBeNull()
  })
})

describe('install from a non-ready state', () => {
  it('never quits the app for nothing', () => {
    const { updater, service } = serviceWith()
    const quit = vi.spyOn(updater, 'quitAndInstall')

    updater.emit('update-available', { version: '0.2.0' })
    service.install()

    expect(quit).not.toHaveBeenCalled()
  })
})
