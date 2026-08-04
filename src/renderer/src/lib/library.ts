import type { ModStatusSummary, ModSummary } from '@shared/ipc'

/**
 * Filtering, sorting and the state-to-actions mapping for the library view,
 * kept free of React so it can be tested without a DOM.
 */

export type LibraryFilter = 'all' | 'ready' | 'downloading' | 'available' | 'error'

export type LibrarySort = 'name' | 'author' | 'status'

export const FILTERS: ReadonlyArray<{ id: LibraryFilter; label: string; alert?: boolean }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready to play' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'available', label: 'Not installed' },
  { id: 'error', label: 'Needs attention', alert: true }
]

export const SORTS: ReadonlyArray<{ id: LibrarySort; label: string }> = [
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'author', label: 'Author' },
  { id: 'status', label: 'Status' }
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
  }
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
    }
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
  return {
    all: pool.length,
    ready: pool.filter((mod) => matchesFilter(mod, 'ready')).length,
    downloading: pool.filter((mod) => matchesFilter(mod, 'downloading')).length,
    available: pool.filter((mod) => matchesFilter(mod, 'available')).length,
    error: pool.filter((mod) => matchesFilter(mod, 'error')).length
  }
}

export interface DownloadProgressView {
  percent: number | null
  label: string
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
  'download' | 'cancel' | 'play' | 'retry' | 'remove' | 'reveal' | 'openPage'

export interface ModAction {
  id: ModActionId
  label: string
  /** The one action the row leads with. */
  primary?: boolean
  disabled?: boolean
  /** Why it's disabled, for a title attribute. */
  disabledReason?: string
}

export interface ActionContext {
  hasEmulator: boolean
  /** An install request that hasn't come back yet - the row's buttons are inert
   *  until the status catches up. */
  busy?: boolean
}

/**
 * Which buttons a row offers, given its state. Returned as data rather than
 * markup so the mapping is testable on its own.
 */
export function actionsFor(mod: ModSummary, context: ActionContext): ModAction[] {
  const busy = context.busy === true

  switch (mod.status.state) {
    case 'ready':
      return [
        {
          id: 'play',
          label: '▶ Play',
          primary: true,
          disabled: busy || !context.hasEmulator,
          disabledReason: context.hasEmulator ? undefined : 'Configure an emulator first'
        },
        { id: 'reveal', label: 'Folder', disabled: busy },
        { id: 'remove', label: 'Remove', disabled: busy }
      ]

    case 'downloading':
      return [{ id: 'cancel', label: 'Cancel' }]

    case 'error':
      return [
        { id: 'retry', label: 'Retry', primary: true, disabled: busy || !mod.downloadLink },
        ...(mod.downloadLink ? [{ id: 'openPage' as const, label: 'Open page ↗' }] : [])
      ]

    case 'not_downloaded':
      return [
        {
          id: 'download',
          label: 'Download',
          primary: true,
          disabled: busy || !mod.downloadLink,
          disabledReason: mod.downloadLink ? undefined : 'This mod has no download link'
        }
      ]
  }
}

export const STATUS_LABELS: Record<ModStatusSummary['state'], { text: string; className: string }> =
  {
    ready: { text: 'Ready', className: 'ready' },
    downloading: { text: 'Downloading', className: 'downloading' },
    error: { text: 'Error', className: 'error' },
    not_downloaded: { text: 'Not installed', className: 'available' }
  }
