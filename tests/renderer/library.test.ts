import { describe, expect, it } from 'vitest'
import {
  actionsFor,
  countsByFilter,
  formatProgress,
  sortMods,
  visibleMods
} from '../../src/renderer/src/lib/library'
import type { ModStatusState, ModStatusSummary, ModSummary } from '../../src/shared/ipc'

type ModOverrides = Partial<Omit<ModSummary, 'status'>> & {
  id: string
  status?: Partial<ModStatusSummary>
}

function mod({ status, ...overrides }: ModOverrides): ModSummary {
  return {
    source: 'test',
    name: overrides.id,
    author: null,
    description: null,
    thumbnailUrl: null,
    downloadLink: 'https://example.test/patch.bps',
    completionStatus: null,
    ...overrides,
    status: {
      state: 'not_downloaded',
      patchedRomPath: null,
      downloadProgressBytes: null,
      downloadTotalBytes: null,
      errorMessage: null,
      ...status
    }
  }
}

function withState(id: string, state: ModStatusState): ModSummary {
  return mod({ id, status: { state } })
}

const CATALOG: ModSummary[] = [
  mod({ id: 'a', name: 'Zelda’s Birthday', author: 'Sanguinetti' }),
  mod({ id: 'b', name: 'Dawn & Dusk', author: 'Nokaubure', status: { state: 'ready' } }),
  mod({ id: 'c', name: 'Hylian Ruins', author: 'ShadowFire', status: { state: 'error' } }),
  mod({ id: 'd', name: 'Chaos Edition', author: 'Nokaubure' })
]

describe('visibleMods', () => {
  it('applies filter and query together', () => {
    const result = visibleMods(CATALOG, { filter: 'all', query: 'nokaubure', sort: 'name' })
    expect(result.map((m) => m.id)).toEqual(['d', 'b'])
  })

  it('matches on name or author but not description', () => {
    const catalog = [mod({ id: 'x', name: 'Something', description: 'mentions kokiri forest' })]
    expect(visibleMods(catalog, { filter: 'all', query: 'kokiri', sort: 'name' })).toHaveLength(0)
    expect(visibleMods(catalog, { filter: 'all', query: 'someth', sort: 'name' })).toHaveLength(1)
  })

  it('narrows to a single state when a state filter is active', () => {
    const result = visibleMods(CATALOG, { filter: 'error', query: '', sort: 'name' })
    expect(result.map((m) => m.id)).toEqual(['c'])
  })
})

describe('sortMods', () => {
  it('orders by name, author then name, or state then name', () => {
    expect(sortMods(CATALOG, 'name').map((m) => m.name)).toEqual([
      'Chaos Edition',
      'Dawn & Dusk',
      'Hylian Ruins',
      'Zelda’s Birthday'
    ])

    // Two mods share an author; the tie breaks on name.
    expect(sortMods(CATALOG, 'author').map((m) => m.id)).toEqual(['d', 'b', 'a', 'c'])

    expect(sortMods(CATALOG, 'status').map((m) => m.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('does not mutate the input', () => {
    const input = [...CATALOG]
    sortMods(input, 'status')
    expect(input.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('countsByFilter', () => {
  it('counts every state', () => {
    expect(countsByFilter(CATALOG, '')).toEqual({
      all: 4,
      ready: 1,
      downloading: 0,
      available: 2,
      error: 1
    })
  })

  it('composes with the search query so chips narrow along with the list', () => {
    expect(countsByFilter(CATALOG, 'nokaubure')).toEqual({
      all: 2,
      ready: 1,
      downloading: 0,
      available: 1,
      error: 0
    })
  })
})

describe('formatProgress', () => {
  it('reports a percentage when the total is known', () => {
    const view = formatProgress({
      state: 'downloading',
      patchedRomPath: null,
      downloadProgressBytes: 5 * 1024 * 1024,
      downloadTotalBytes: 10 * 1024 * 1024,
      errorMessage: null
    })
    expect(view.percent).toBe(50)
    expect(view.label).toBe('5.0 MB / 10.0 MB · 50%')
  })

  it('falls back to a byte count when the server sent no content-length', () => {
    const view = formatProgress({
      state: 'downloading',
      patchedRomPath: null,
      downloadProgressBytes: 2048,
      downloadTotalBytes: null,
      errorMessage: null
    })
    expect(view.percent).toBeNull()
    expect(view.label).toBe('2 KB')
  })

  it('does not exceed 100% if more bytes arrive than advertised', () => {
    const view = formatProgress({
      state: 'downloading',
      patchedRomPath: null,
      downloadProgressBytes: 120,
      downloadTotalBytes: 100,
      errorMessage: null
    })
    expect(view.percent).toBe(100)
  })
})

describe('actionsFor', () => {
  it('offers Play for a ready mod, disabled until an emulator exists', () => {
    const ready = withState('r', 'ready')

    const withEmulator = actionsFor(ready, { hasEmulator: true })
    expect(withEmulator.map((a) => a.id)).toEqual(['play', 'reveal', 'remove'])
    expect(withEmulator[0].disabled).toBe(false)

    const withoutEmulator = actionsFor(ready, { hasEmulator: false })
    expect(withoutEmulator[0].disabled).toBe(true)
    expect(withoutEmulator[0].disabledReason).toBeTruthy()
    // The mod stays visible and removable; only Play is blocked.
    expect(withoutEmulator.map((a) => a.id)).toEqual(['play', 'reveal', 'remove'])
  })

  it('offers only Cancel while downloading', () => {
    expect(
      actionsFor(withState('d', 'downloading'), { hasEmulator: true }).map((a) => a.id)
    ).toEqual(['cancel'])
  })

  it('offers Retry and the mod page for an error', () => {
    expect(actionsFor(withState('e', 'error'), { hasEmulator: true }).map((a) => a.id)).toEqual([
      'retry',
      'openPage'
    ])
  })

  it('disables Download and hides the mod page when there is no download link', () => {
    const linkless = mod({ id: 'n', downloadLink: null })
    const [download] = actionsFor(linkless, { hasEmulator: true })
    expect(download.id).toBe('download')
    expect(download.disabled).toBe(true)

    const erroring = mod({ id: 'n2', downloadLink: null, status: { state: 'error' } })
    expect(actionsFor(erroring, { hasEmulator: true }).map((a) => a.id)).toEqual(['retry'])
  })

  it('disables everything actionable while a request is in flight', () => {
    const actions = actionsFor(withState('r', 'ready'), { hasEmulator: true, busy: true })
    expect(actions.every((a) => a.disabled)).toBe(true)
  })
})
