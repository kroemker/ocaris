import { describe, expect, it } from 'vitest'
import {
  actionsFor,
  countsByFilter,
  defaultEmulator,
  formatProgress,
  groupModsByState,
  playMenuItems,
  sortMods,
  visibleMods
} from '../../src/renderer/src/lib/library'
import type { Emulator, ModStatusState, ModStatusSummary, ModSummary } from '../../src/shared/ipc'

function emulator(id: number, name: string, isDefault = false): Emulator {
  return {
    id,
    name,
    executablePath: `/usr/bin/${name.toLowerCase()}`,
    argsTemplate: '{romPath}',
    isDefault,
    knownId: null,
    kind: 'custom',
    createdAt: 0,
    updatedAt: 0
  }
}

const EMULATORS: Emulator[] = [emulator(1, 'Ares'), emulator(2, 'Project64', true)]

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
    installable: true,
    pageUrl: null,
    completionStatus: null,
    sources: [{ source: 'test', pageUrl: null }],
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

describe('groupModsByState', () => {
  it('buckets ready, downloading, error then not_downloaded, skipping empty buckets', () => {
    const groups = groupModsByState(sortMods(CATALOG, 'name'))
    expect(groups.map((g) => g.state)).toEqual(['ready', 'error', 'not_downloaded'])
  })

  it('preserves the order of the list it was given within each bucket', () => {
    const withTwoReady = [
      ...CATALOG,
      mod({ id: 'e', name: 'Zeta', author: 'Aardvark', status: { state: 'ready' } })
    ]

    const byName = groupModsByState(sortMods(withTwoReady, 'name'))
    expect(byName.find((g) => g.state === 'ready')?.mods.map((m) => m.id)).toEqual(['b', 'e'])

    const byAuthor = groupModsByState(sortMods(withTwoReady, 'author'))
    expect(byAuthor.find((g) => g.state === 'ready')?.mods.map((m) => m.id)).toEqual(['e', 'b'])
  })

  it('omits buckets with no mods', () => {
    const groups = groupModsByState([withState('a', 'ready')])
    expect(groups).toEqual([{ state: 'ready', mods: [withState('a', 'ready')] }])
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

    const withEmulator = actionsFor(ready, { emulators: EMULATORS })
    expect(withEmulator.map((a) => a.id)).toEqual(['play', 'reveal', 'remove'])
    expect(withEmulator[0].disabled).toBe(false)

    const withoutEmulator = actionsFor(ready, { emulators: [] })
    expect(withoutEmulator[0].disabled).toBe(true)
    expect(withoutEmulator[0].disabledReason).toBeTruthy()
    // The mod stays visible and removable; only Play is blocked.
    expect(withoutEmulator.map((a) => a.id)).toEqual(['play', 'reveal', 'remove'])
  })

  it('offers only Cancel while downloading', () => {
    expect(
      actionsFor(withState('d', 'downloading'), { emulators: EMULATORS }).map((a) => a.id)
    ).toEqual(['cancel'])
  })

  it('offers Retry and the mod page for an error', () => {
    expect(actionsFor(withState('e', 'error'), { emulators: EMULATORS }).map((a) => a.id)).toEqual([
      'retry',
      'openPage'
    ])
  })

  it('offers nothing but a disabled Open page when there is no link at all', () => {
    const linkless = mod({ id: 'n', downloadLink: null, installable: false })
    const [only] = actionsFor(linkless, { emulators: EMULATORS })
    expect(only.id).toBe('openPage')
    expect(only.disabled).toBe(true)

    const erroring = mod({
      id: 'n2',
      downloadLink: null,
      installable: false,
      status: { state: 'error' }
    })
    expect(actionsFor(erroring, { emulators: EMULATORS }).map((a) => a.id)).toEqual(['retry'])
  })

  /**
   * Two thirds of the wiki's mods link to a MediaFire or Drive landing page.
   * A Download button there could only ever fail, so the row leads with the
   * page instead.
   */
  it('replaces Download with Open page for a link the installer cannot use', () => {
    const manual = mod({
      id: 'm',
      downloadLink: 'https://www.mediafire.com/file/abc',
      installable: false,
      pageUrl: 'https://zelda-64-mods.fandom.com/wiki/Burger_Quest'
    })

    const actions = actionsFor(manual, { emulators: EMULATORS })
    expect(actions.map((a) => a.id)).toEqual(['openPage'])
    expect(actions[0].primary).toBe(true)
    expect(actions[0].disabled).toBeFalsy()
  })

  it('retries an errored mod only when its link is installable', () => {
    const manual = mod({
      id: 'e2',
      downloadLink: 'https://www.mediafire.com/file/abc',
      installable: false,
      status: { state: 'error' }
    })

    const [retry] = actionsFor(manual, { emulators: EMULATORS })
    expect(retry.id).toBe('retry')
    expect(retry.disabled).toBe(true)
  })

  it('names the button Play regardless of how many emulators exist', () => {
    const [play] = actionsFor(withState('r', 'ready'), { emulators: [emulator(1, 'Ares')] })
    expect(play.label).toBe('▶ Play')
  })

  it('disables everything actionable while a request is in flight', () => {
    const actions = actionsFor(withState('r', 'ready'), { emulators: EMULATORS, busy: true })
    expect(actions.every((a) => a.disabled)).toBe(true)
  })
})

describe('defaultEmulator', () => {
  it('prefers the flagged default, falls back to the first, and copes with none', () => {
    expect(defaultEmulator(EMULATORS)?.name).toBe('Project64')
    expect(defaultEmulator([emulator(3, 'Mupen'), emulator(4, 'Ares')])?.name).toBe('Mupen')
    expect(defaultEmulator([])).toBeUndefined()
  })
})

describe('playMenuItems', () => {
  it('labels every emulator and puts the default first', () => {
    const items = playMenuItems(EMULATORS)
    expect(items.map((i) => i.label)).toEqual(['Play with Project64', 'Play with Ares'])
    expect(items.map((i) => i.isDefault)).toEqual([true, false])
  })

  it('keeps configured order among the rest', () => {
    const items = playMenuItems([
      emulator(1, 'Ares'),
      emulator(2, 'Mupen'),
      emulator(3, 'Project64', true)
    ])
    expect(items.map((i) => i.emulator.name)).toEqual(['Project64', 'Ares', 'Mupen'])
  })

  it('is empty when nothing is configured', () => {
    expect(playMenuItems([])).toEqual([])
  })
})
