import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryPrefs, UiState } from '@shared/ipc'
import { DEFAULT_UI_STATE } from '@shared/uiState'

/**
 * Long enough that typing in the search box doesn't write once per keystroke,
 * short enough that a click-then-quit still lands.
 */
const WRITE_DEBOUNCE_MS = 300

export interface UiStateHandle {
  state: UiState
  /** False until the stored state has arrived; the view waits on it so the
   *  filter bar doesn't paint the defaults and then snap. */
  loaded: boolean
  setLibrary: (patch: Partial<LibraryPrefs>) => void
  setSettingsPane: (pane: UiState['settingsPane']) => void
}

/**
 * Owns everything the renderer remembers between runs. Call once, at the top:
 * two instances would each debounce their own writes and the later one would
 * win, silently dropping the other's changes.
 *
 * Writes are optimistic - the UI moves now, the database catches up - because
 * nothing downstream depends on the round trip, unlike the theme, where main
 * has to update nativeTheme before the media query agrees.
 */
export function useUiState(): UiStateHandle {
  const [state, setState] = useState<UiState>(DEFAULT_UI_STATE)
  const [loaded, setLoaded] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<UiState | undefined>(undefined)
  // The value updates read from. A state updater can't be used for that: it
  // has to stay pure, and every update here also has to schedule a write.
  const current = useRef<UiState>(DEFAULT_UI_STATE)

  useEffect(() => {
    void window.api.config.get().then((settings) => {
      current.current = settings.uiState
      setState(settings.uiState)
      setLoaded(true)
    })
  }, [])

  const flush = useCallback((): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    const next = pending.current
    pending.current = undefined
    if (next) void window.api.config.setUiState(next)
  }, [])

  // Best effort: invoke() is async and unload won't wait for it, but a pending
  // write is at most WRITE_DEBOUNCE_MS old, and closing the window that fast
  // after a keystroke costs one trailing search character at worst.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const write = useCallback((next: UiState): void => {
    pending.current = next
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      const queued = pending.current
      pending.current = undefined
      if (queued) void window.api.config.setUiState(queued)
    }, WRITE_DEBOUNCE_MS)
  }, [])

  const apply = useCallback(
    (update: (previous: UiState) => UiState): void => {
      const next = update(current.current)
      current.current = next
      setState(next)
      write(next)
    },
    [write]
  )

  const setLibrary = useCallback(
    (patch: Partial<LibraryPrefs>): void => {
      apply((previous) => ({ ...previous, library: { ...previous.library, ...patch } }))
    },
    [apply]
  )

  const setSettingsPane = useCallback(
    (pane: UiState['settingsPane']): void => {
      apply((previous) => ({ ...previous, settingsPane: pane }))
    },
    [apply]
  )

  return { state, loaded, setLibrary, setSettingsPane }
}
