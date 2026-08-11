import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW_BOUNDS,
  MIN_HEIGHT,
  MIN_WIDTH,
  normalizeWindowBounds,
  parseWindowBounds,
  type DisplayRect
} from '../../../src/main/window/bounds'

const PRIMARY: DisplayRect = { x: 0, y: 0, width: 1920, height: 1080 }
const SECONDARY: DisplayRect = { x: 1920, y: 0, width: 1920, height: 1080 }

describe('normalizeWindowBounds', () => {
  it('keeps bounds that sit on an attached display', () => {
    const bounds = { x: 100, y: 80, width: 1200, height: 800, maximized: false }

    expect(normalizeWindowBounds(bounds, [PRIMARY])).toEqual(bounds)
  })

  it('keeps bounds on a secondary display', () => {
    const bounds = { x: 2000, y: 40, width: 1000, height: 700, maximized: true }

    expect(normalizeWindowBounds(bounds, [PRIMARY, SECONDARY])).toEqual(bounds)
  })

  it('drops the position when the display it was on is gone', () => {
    const bounds = { x: 2000, y: 40, width: 1000, height: 700, maximized: false }

    expect(normalizeWindowBounds(bounds, [PRIMARY])).toEqual({ ...bounds, x: null, y: null })
  })

  it('drops a position that only overlaps a display by a sliver', () => {
    // Four pixels of window on screen is not something a user can grab.
    const bounds = { x: -1196, y: 300, width: 1200, height: 800, maximized: false }

    expect(normalizeWindowBounds(bounds, [PRIMARY])).toMatchObject({ x: null, y: null })
  })

  it('clamps a size below the window minimums', () => {
    const normalized = normalizeWindowBounds(
      { x: 0, y: 0, width: 100, height: 50, maximized: false },
      [PRIMARY]
    )

    expect(normalized.width).toBe(MIN_WIDTH)
    expect(normalized.height).toBe(MIN_HEIGHT)
  })

  it('rounds fractional geometry', () => {
    const normalized = normalizeWindowBounds(
      { x: 10.6, y: 20.2, width: 1200.7, height: 800.4, maximized: false },
      [PRIMARY]
    )

    expect(normalized).toEqual({ x: 11, y: 20, width: 1201, height: 800, maximized: false })
  })

  it('falls back to the defaults for junk, and to a default size for junk fields', () => {
    expect(normalizeWindowBounds(null, [PRIMARY])).toEqual(DEFAULT_WINDOW_BOUNDS)
    expect(normalizeWindowBounds('1200x800', [PRIMARY])).toEqual(DEFAULT_WINDOW_BOUNDS)
    expect(normalizeWindowBounds({ width: Number.NaN, height: null }, [PRIMARY])).toEqual(
      DEFAULT_WINDOW_BOUNDS
    )
  })

  it('treats a non-boolean maximized flag as not maximized', () => {
    expect(
      normalizeWindowBounds({ x: 0, y: 0, width: 1200, height: 800, maximized: 1 }, [PRIMARY])
        .maximized
    ).toBe(false)
  })

  it('drops the position when there are no displays at all', () => {
    expect(
      normalizeWindowBounds({ x: 0, y: 0, width: 1200, height: 800, maximized: false }, [])
    ).toMatchObject({ x: null, y: null })
  })
})

describe('parseWindowBounds', () => {
  it('reads back what was stored', () => {
    const bounds = { x: 12, y: 34, width: 1280, height: 900, maximized: true }

    expect(parseWindowBounds(JSON.stringify(bounds), [PRIMARY])).toEqual(bounds)
  })

  it('returns the defaults for null and for invalid JSON', () => {
    expect(parseWindowBounds(null, [PRIMARY])).toEqual(DEFAULT_WINDOW_BOUNDS)
    expect(parseWindowBounds('{oops', [PRIMARY])).toEqual(DEFAULT_WINDOW_BOUNDS)
  })
})
