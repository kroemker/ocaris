import { useCallback, useEffect, useState } from 'react'
import type { ThemeSource } from '@shared/ipc'

export type ResolvedTheme = 'light' | 'dark'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

/**
 * Electron reports the *effective* scheme here: with nativeTheme.themeSource
 * set from the stored preference, prefers-color-scheme already accounts for a
 * pinned 'light'/'dark'. Resolving 'system' through it is therefore enough,
 * and it also covers the OS flipping while the app is running.
 */
function resolve(pref: ThemeSource): ResolvedTheme {
  if (pref !== 'system') return pref
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
}

function applyToDocument(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
}

export interface UseThemeResult {
  /** What the user chose - may be 'system'. */
  pref: ThemeSource
  /** What that currently renders as. */
  resolved: ResolvedTheme
  setPref: (next: ThemeSource) => Promise<void>
}

export function useTheme(): UseThemeResult {
  const [pref, setPrefState] = useState<ThemeSource>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve('system'))

  useEffect(() => {
    applyToDocument(resolved)
  }, [resolved])

  useEffect(() => {
    void window.api.config.get().then((settings) => {
      setPrefState(settings.theme)
      setResolved(resolve(settings.theme))
    })
  }, [])

  useEffect(() => {
    const media = window.matchMedia(LIGHT_QUERY)
    const onChange = (): void => setResolved(resolve(pref))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  const setPref = useCallback(async (next: ThemeSource): Promise<void> => {
    // Paint immediately; main persists and updates nativeTheme, which is what
    // makes the media query agree on the next read.
    setPrefState(next)
    setResolved(resolve(next))
    const settings = await window.api.config.setTheme(next)
    setPrefState(settings.theme)
    setResolved(resolve(settings.theme))
  }, [])

  return { pref, resolved, setPref }
}
