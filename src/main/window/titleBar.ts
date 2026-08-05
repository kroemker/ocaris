import { nativeTheme, type BrowserWindow, type TitleBarOverlayOptions } from 'electron'

/**
 * The app's own top bar doubles as the window title bar (titleBarStyle:
 * 'hidden'), so the native window controls are drawn over it and have to be
 * recolored whenever the theme changes.
 *
 * Colors mirror tokens.css: background is --bg2 (the top bar's fill), symbols
 * are --fg. Keep the two in sync.
 */
const OVERLAY: Record<'dark' | 'light', TitleBarOverlayOptions> = {
  dark: { color: '#151922', symbolColor: '#e6e8ee', height: 46 },
  light: { color: '#f7f8fb', symbolColor: '#171a21', height: 46 }
}

export function titleBarOverlayForTheme(): TitleBarOverlayOptions {
  return nativeTheme.shouldUseDarkColors ? OVERLAY.dark : OVERLAY.light
}

export function backgroundColorForTheme(): string {
  // Painted before the renderer's first frame, so it must match --bg rather
  // than the top bar, or the window flashes on launch.
  return nativeTheme.shouldUseDarkColors ? '#0f1116' : '#ffffff'
}

/**
 * Applies the current theme's overlay colors. Not every platform draws an
 * overlay (macOS renders traffic lights instead), and Electron throws rather
 * than no-opping there, so failures are swallowed - the window is still fine,
 * it just has no recolorable overlay.
 */
export function applyTitleBarOverlay(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  try {
    window.setTitleBarOverlay(titleBarOverlayForTheme())
  } catch {
    // Overlay unsupported on this platform - nothing to recolor.
  }
}
