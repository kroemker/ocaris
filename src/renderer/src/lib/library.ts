import type {
  Emulator,
  LibraryFilter,
  LibrarySort,
  ModStatusSummary,
  ModSummary
} from '@shared/ipc'

/**
 * Filtering, sorting and the state-to-actions mapping for the library view,
 * kept free of React so it can be tested without a DOM.
 */

// The unions themselves live in the shared IPC contract - main validates them
// before persisting - but they read as part of this module's API, so they are
// re-exported here and everything else can keep importing them from one place.
export type { LibraryFilter, LibrarySort }

export const FILTERS: ReadonlyArray<{
  id: LibraryFilter
  label: string
  alert?: boolean
}> = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'ready', label: 'Ready to play' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'available', label: 'Not installed' },
  { id: 'error', label: 'Needs attention', alert: true }
]

export const SORTS: ReadonlyArray<{ id: LibrarySort; label: string }> = [
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'author', label: 'Author' },
  { id: 'status', label: 'Status' },
  { id: 'recent', label: 'Recently added' }
]

export function matchesFilter(mod: ModSummary, filter: LibraryFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'ready':
      return mod.status.state === 'ready'
    case 'downloading':
      return mod.status.state === 'downloading'
    case 'available':
      return mod.status.state === 'not_downloaded'
    case 'error':
      return mod.status.state === 'error'
    case 'favorites':
      return mod.prefs.favorite
  }
}

/** A mod first seen this recently is worth pointing out in the row. */
export const NEW_MOD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function isNewMod(mod: ModSummary, now = Date.now()): boolean {
  return mod.firstSeenAt !== null && now - mod.firstSeenAt <= NEW_MOD_WINDOW_MS
}

/** Name and author only: descriptions are clamped to two lines in the row, so
 *  a match inside one reads as a false positive. */
export function matchesQuery(mod: ModSummary, query: string): boolean {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true
  return `${mod.name} ${mod.author ?? ''}`.toLowerCase().includes(trimmed)
}

/** Ready first, then in-flight, then problems, then the rest. */
const STATE_ORDER: Record<ModStatusSummary['state'], number> = {
  ready: 0,
  downloading: 1,
  error: 2,
  not_downloaded: 3
}

export function sortMods(mods: readonly ModSummary[], sort: LibrarySort): ModSummary[] {
  const byName = (a: ModSummary, b: ModSummary): number => a.name.localeCompare(b.name)

  return [...mods].sort((a, b) => {
    switch (sort) {
      case 'name':
        return byName(a, b)
      case 'author':
        return (a.author ?? '').localeCompare(b.author ?? '') || byName(a, b)
      case 'status':
        return STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state] || byName(a, b)
      case 'recent':
        // Newest first. A row with no first_seen_at predates the column and
        // sorts last rather than to the top of "recently added".
        return (b.firstSeenAt ?? -Infinity) - (a.firstSeenAt ?? -Infinity) || byName(a, b)
    }
  })
}

export interface ModGroup {
  state: ModStatusSummary['state']
  mods: ModSummary[]
}

/**
 * Buckets an already-sorted list by state, preserving each mod's order
 * within its bucket so "grouped" and "sorted" compose. Bucket order follows
 * STATE_ORDER; empty buckets are omitted.
 */
export function groupModsByState(mods: readonly ModSummary[]): ModGroup[] {
  const buckets = new Map<ModStatusSummary['state'], ModSummary[]>()
  for (const mod of mods) {
    const bucket = buckets.get(mod.status.state)
    if (bucket) bucket.push(mod)
    else buckets.set(mod.status.state, [mod])
  }

  return (Object.keys(STATE_ORDER) as ModStatusSummary['state'][])
    .sort((a, b) => STATE_ORDER[a] - STATE_ORDER[b])
    .flatMap((state) => {
      const groupMods = buckets.get(state)
      return groupMods ? [{ state, mods: groupMods }] : []
    })
}

export interface LibraryView {
  filter: LibraryFilter
  query: string
  sort: LibrarySort
}

export function visibleMods(mods: readonly ModSummary[], view: LibraryView): ModSummary[] {
  return sortMods(
    mods.filter((mod) => matchesFilter(mod, view.filter) && matchesQuery(mod, view.query)),
    view.sort
  )
}

/**
 * Chip counts are computed against the search-filtered pool, so search and
 * filter compose: searching narrows every chip's count, not just the list.
 */
export function countsByFilter(
  mods: readonly ModSummary[],
  query: string
): Record<LibraryFilter, number> {
  const pool = mods.filter((mod) => matchesQuery(mod, query))
  const count = (filter: LibraryFilter): number =>
    pool.filter((mod) => matchesFilter(mod, filter)).length

  return {
    all: pool.length,
    favorites: count('favorites'),
    ready: count('ready'),
    downloading: count('downloading'),
    available: count('available'),
    error: count('error')
  }
}

export interface DownloadProgressView {
  percent: number | null
  label: string
}

/** Date only: the hour a catalog refresh happened to run isn't information. */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function formatProgress(status: ModStatusSummary): DownloadProgressView {
  const done = status.downloadProgressBytes ?? 0

  // The server doesn't always send a content-length, in which case there's a
  // byte count to show but no percentage.
  if (!status.downloadTotalBytes) {
    return { percent: null, label: done > 0 ? formatBytes(done) : 'Starting…' }
  }

  const percent = Math.min(100, Math.round((done / status.downloadTotalBytes) * 100))
  return {
    percent,
    label: `${formatBytes(done)} / ${formatBytes(status.downloadTotalBytes)} · ${percent}%`
  }
}

export type ModActionId =
  | 'download'
  | 'cancel'
  | 'play'
  | 'retry'
  | 'remove'
  | 'reveal'
  | 'openPage'
  // Row controls rather than state-dependent actions: these two are offered
  // whatever the mod's status is, so actionsFor() doesn't return them.
  | 'toggleFavorite'
  | 'details'

export interface ModAction {
  id: ModActionId
  label: string
  /** The one action the row leads with. */
  primary?: boolean
  disabled?: boolean
  /** Why it's disabled, for a title attribute. */
  disabledReason?: string
}

/** Where "Open page" goes. The mod's own page when a source gave one, the
 *  download link otherwise - for a landing-page link those are the same
 *  thing anyway. */
export function pageLink(mod: ModSummary): string | null {
  return mod.pageUrl ?? mod.downloadLink
}

/** Catalog ids are internal; these are what a row shows. */
export const SOURCE_LABELS: Record<string, string> = {
  hylianmodding: 'hylianmodding',
  zeldafandom: 'wiki'
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

export interface ActionContext {
  emulators: readonly Emulator[]
  /** An install request that hasn't come back yet - the row's buttons are inert
   *  until the status catches up. */
  busy?: boolean
}

/** What a bare Play click launches: the emulator flagged default, or the only
 *  one there is. */
export function defaultEmulator(emulators: readonly Emulator[]): Emulator | undefined {
  return emulators.find((emulator) => emulator.isDefault) ?? emulators[0]
}

/**
 * What Play launches for one mod: its remembered emulator if it still exists,
 * the global default otherwise. A stored id whose emulator was deleted falls
 * back silently - the alternative is a row that can't be played until the user
 * finds a setting they don't remember making.
 */
export function emulatorForMod(
  mod: ModSummary,
  emulators: readonly Emulator[]
): Emulator | undefined {
  const remembered = emulators.find((emulator) => emulator.id === mod.prefs.emulatorId)
  return remembered ?? defaultEmulator(emulators)
}

export interface PlayMenuItem {
  emulator: Emulator
  label: string
  /** The one a bare Play click uses. */
  isPreferred: boolean
  /** Why it's preferred: because this mod remembers it, or because it's the
   *  app-wide default. Null for the rest. */
  tag: 'this mod' | 'default' | null
}

/**
 * Entries for the Play button's menu. The emulator a bare click would use
 * comes first, so the top of the list matches the button itself; the rest keep
 * the order they were configured in.
 */
export function playMenuItems(
  emulators: readonly Emulator[],
  preferredId?: number | null
): PlayMenuItem[] {
  const fallback = defaultEmulator(emulators)
  const remembered = emulators.find((emulator) => emulator.id === preferredId)
  const preferred = remembered ?? fallback

  return [...emulators]
    .sort((a, b) => Number(b.id === preferred?.id) - Number(a.id === preferred?.id))
    .map((emulator) => ({
      emulator,
      label: `Play with ${emulator.name}`,
      isPreferred: emulator.id === preferred?.id,
      tag:
        emulator.id === remembered?.id
          ? ('this mod' as const)
          : emulator.id === fallback?.id
            ? ('default' as const)
            : null
    }))
}

/**
 * Which buttons a row offers, given its state. Returned as data rather than
 * markup so the mapping is testable on its own.
 */
export function actionsFor(mod: ModSummary, context: ActionContext): ModAction[] {
  const busy = context.busy === true
  const hasEmulator = context.emulators.length > 0

  switch (mod.status.state) {
    case 'ready':
      return [
        {
          id: 'play',
          label: '▶ Play',
          primary: true,
          disabled: busy || !hasEmulator,
          disabledReason: hasEmulator ? undefined : 'Configure an emulator first'
        },
        { id: 'reveal', label: 'Folder', disabled: busy },
        { id: 'remove', label: 'Remove', disabled: busy }
      ]

    case 'downloading':
      return [{ id: 'cancel', label: 'Cancel' }]

    case 'error':
      return [
        {
          id: 'retry',
          label: 'Retry',
          primary: true,
          disabled: busy || !mod.installable
        },
        ...(pageLink(mod) ? [{ id: 'openPage' as const, label: 'Open page ↗' }] : [])
      ]

    case 'not_downloaded':
      // A link the installer can't act on (a MediaFire or Drive landing page,
      // most of the wiki's catalog) gets no Download button: it could only
      // ever fail, so the row sends the user to the page instead.
      if (!mod.installable) {
        return [
          {
            id: 'openPage',
            label: 'Open page ↗',
            primary: true,
            disabled: !pageLink(mod),
            disabledReason: pageLink(mod) ? undefined : 'This mod has no page to open'
          }
        ]
      }

      return [{ id: 'download', label: 'Download', primary: true, disabled: busy }]
  }
}

export const STATUS_LABELS: Record<ModStatusSummary['state'], { text: string; className: string }> =
  {
    ready: { text: 'Ready', className: 'ready' },
    downloading: { text: 'Downloading', className: 'downloading' },
    error: { text: 'Error', className: 'error' },
    not_downloaded: { text: 'Not installed', className: 'available' }
  }
