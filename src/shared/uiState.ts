import type { LibraryFilter, LibraryPrefs, LibrarySort, SettingsPane, UiState } from './ipc'

/**
 * Reading UI state back is the one place where anything can arrive: a row
 * written by an older version, a hand-edited database, or an IPC payload from
 * a renderer that has drifted. Every field is therefore checked against the
 * values that actually exist and falls back to its default on a miss, so a bad
 * value degrades to "the app looks fresh" instead of throwing on boot.
 */

const FILTERS: readonly LibraryFilter[] = [
  'all',
  'ready',
  'downloading',
  'available',
  'error',
  'favorites'
]
const SORTS: readonly LibrarySort[] = ['name', 'author', 'status', 'recent']
const PANES: readonly SettingsPane[] = [
  'appearance',
  'rom',
  'emulators',
  'catalog',
  'storage',
  'about'
]

/** The search box is a search box; a stored value longer than this is junk. */
export const MAX_QUERY_LENGTH = 200

export const DEFAULT_LIBRARY_PREFS: LibraryPrefs = {
  filter: 'all',
  sort: 'name',
  groupByState: false,
  query: ''
}

export const DEFAULT_UI_STATE: UiState = {
  library: DEFAULT_LIBRARY_PREFS,
  settingsPane: 'appearance'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function normalizeLibraryPrefs(value: unknown): LibraryPrefs {
  if (!isRecord(value)) return DEFAULT_LIBRARY_PREFS

  return {
    filter: oneOf(value.filter, FILTERS, DEFAULT_LIBRARY_PREFS.filter),
    sort: oneOf(value.sort, SORTS, DEFAULT_LIBRARY_PREFS.sort),
    groupByState: value.groupByState === true,
    query: typeof value.query === 'string' ? value.query.slice(0, MAX_QUERY_LENGTH) : ''
  }
}

export function normalizeUiState(value: unknown): UiState {
  if (!isRecord(value)) return DEFAULT_UI_STATE

  return {
    library: normalizeLibraryPrefs(value.library),
    settingsPane: oneOf(value.settingsPane, PANES, DEFAULT_UI_STATE.settingsPane)
  }
}

/**
 * Parses the stored JSON. A row that isn't valid JSON at all is treated the
 * same as a row with bad fields: defaults, no throw - this runs on the path
 * that answers config:get, which the first paint waits on.
 */
export function parseUiState(json: string | null): UiState {
  if (!json) return DEFAULT_UI_STATE

  try {
    return normalizeUiState(JSON.parse(json))
  } catch {
    return DEFAULT_UI_STATE
  }
}
