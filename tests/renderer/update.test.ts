import { describe, expect, it } from 'vitest'
import { updateView } from '../../src/renderer/src/lib/update'
import type { UpdateStatus } from '../../src/shared/ipc'

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    state: 'idle',
    version: null,
    releaseNotes: null,
    percent: null,
    transferredBytes: null,
    totalBytes: null,
    message: null,
    ...overrides
  }
}

describe('updateView', () => {
  it('offers a check when idle, naming the version in hand', () => {
    const view = updateView(status(), '0.1.0')
    expect(view.headline).toBe('Ocaris 0.1.0 is up to date')
    expect(view.action).toMatchObject({ id: 'check' })
    expect(view.banner).toBe(false)
  })

  it('offers a download once an update is available, with its notes', () => {
    const view = updateView(
      status({ state: 'available', version: '0.2.0', releaseNotes: 'Adds things.' }),
      '0.1.0'
    )
    expect(view.headline).toBe('Ocaris 0.2.0 is available')
    expect(view.detail).toBe('Adds things.')
    expect(view.action).toMatchObject({ id: 'download', primary: true })
  })

  it('shows transfer sizes while downloading and offers no action', () => {
    const view = updateView(
      status({
        state: 'downloading',
        version: '0.2.0',
        percent: 39,
        transferredBytes: 43 * 1024 * 1024,
        totalBytes: 110 * 1024 * 1024
      }),
      '0.1.0'
    )
    expect(view.showProgress).toBe(true)
    expect(view.detail).toBe('43.0 MB of 110.0 MB')
    expect(view.action).toBeNull()
    expect(view.busy).toBe(true)
  })

  it('falls back to a byte count when the download has no known total', () => {
    const view = updateView(
      status({ state: 'downloading', transferredBytes: 2048, totalBytes: null }),
      '0.1.0'
    )
    expect(view.detail).toBe('2 KB')
  })

  /** The only state worth interrupting the library for. */
  it('raises the banner exactly once an update is ready', () => {
    expect(updateView(status({ state: 'ready', version: '0.2.0' }), '0.1.0').banner).toBe(true)
    expect(updateView(status({ state: 'available', version: '0.2.0' }), '0.1.0').banner).toBe(false)
    expect(updateView(status({ state: 'downloading' }), '0.1.0').banner).toBe(false)
    expect(updateView(status({ state: 'error', message: 'boom' }), '0.1.0').banner).toBe(false)
  })

  it('explains an unsupported build instead of offering a button that would fail', () => {
    const view = updateView(
      status({ state: 'unsupported', message: 'macOS builds are not signed yet.' }),
      '0.1.0'
    )
    expect(view.action).toBeNull()
    expect(view.detail).toBe('macOS builds are not signed yet.')
  })

  it('lets an error be retried', () => {
    const view = updateView(status({ state: 'error', message: 'ENOTFOUND' }), '0.1.0')
    expect(view.detail).toBe('ENOTFOUND')
    expect(view.action).toMatchObject({ id: 'check', label: 'Try again' })
  })

  it('copes with an unknown version', () => {
    expect(updateView(status({ state: 'available' }), null).headline).toBe(
      'Ocaris a new version is available'
    )
  })
})
