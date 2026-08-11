import type { WindowBounds } from '@shared/ipc'

/**
 * Restoring a window is mostly a matter of not trusting what was stored. The
 * display layout can have changed since - a laptop undocked, a second monitor
 * unplugged - and a saved position on a screen that no longer exists puts the
 * window somewhere the user can't reach it.
 */

export interface DisplayRect {
  x: number
  y: number
  width: number
  height: number
}

/** Mirrors the BrowserWindow options in src/main/index.ts. */
export const MIN_WIDTH = 720
export const MIN_HEIGHT = 480

export const DEFAULT_WINDOW_BOUNDS: WindowBounds = {
  x: null,
  y: null,
  width: 1100,
  height: 720,
  maximized: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/**
 * True when enough of the window overlaps a display to grab it. A strict
 * intersection isn't enough on its own: a window one pixel onto the screen is
 * technically visible and practically lost, so this asks for a strip of title
 * bar wide enough to click.
 */
function isReachable(bounds: WindowBounds, displays: readonly DisplayRect[]): boolean {
  const { x, y, width, height } = bounds
  if (x === null || y === null) return false

  const GRAB_WIDTH = 96
  const GRAB_HEIGHT = 32

  return displays.some((display) => {
    const overlapX = Math.min(x + width, display.x + display.width) - Math.max(x, display.x)
    const overlapY = Math.min(y + height, display.y + display.height) - Math.max(y, display.y)

    return overlapX >= GRAB_WIDTH && overlapY >= GRAB_HEIGHT
  })
}

/**
 * Coerces whatever was stored into bounds that are safe to hand BrowserWindow.
 * Sizes are clamped to the window's own minimums; an unreachable position is
 * dropped rather than corrected, and null x/y leaves the placement to Electron,
 * which centers on the primary display.
 */
export function normalizeWindowBounds(
  value: unknown,
  displays: readonly DisplayRect[]
): WindowBounds {
  if (!isRecord(value)) return DEFAULT_WINDOW_BOUNDS

  const bounds: WindowBounds = {
    x: finiteOrNull(value.x),
    y: finiteOrNull(value.y),
    width: Math.max(MIN_WIDTH, finiteOr(value.width, DEFAULT_WINDOW_BOUNDS.width)),
    height: Math.max(MIN_HEIGHT, finiteOr(value.height, DEFAULT_WINDOW_BOUNDS.height)),
    maximized: value.maximized === true
  }

  if (!isReachable(bounds, displays)) {
    return { ...bounds, x: null, y: null }
  }

  return bounds
}

/** Same contract as parseUiState: a corrupt row must not stop the app opening. */
export function parseWindowBounds(
  json: string | null,
  displays: readonly DisplayRect[]
): WindowBounds {
  if (!json) return DEFAULT_WINDOW_BOUNDS

  try {
    return normalizeWindowBounds(JSON.parse(json), displays)
  } catch {
    return DEFAULT_WINDOW_BOUNDS
  }
}
