import { useEffect, useRef, useState } from 'react'
import { playMenuItems } from '../lib/library'
import type { Emulator } from '@shared/ipc'

interface PlayButtonProps {
  label: string
  disabled?: boolean
  disabledReason?: string
  emulators: readonly Emulator[]
  /** The emulator this mod remembers, if any: it leads the menu and is what a
   *  bare click launches. */
  preferredEmulatorId?: number | null
  /** No id means "whatever this mod would use anyway", which is what a bare
   *  click sends. Picking from the menu is also how a mod's emulator is set. */
  onPlay: (emulatorId?: number) => void
}

/** Rough height of one menu row, used only to decide which way to open. */
const ITEM_HEIGHT = 32

/**
 * Play as a split button: the wide half launches the default emulator, the
 * caret lists every configured one. With a single emulator the menu could only
 * repeat the wide half, so the caret isn't drawn at all.
 */
function PlayButton({
  label,
  disabled,
  disabledReason,
  emulators,
  preferredEmulatorId,
  onPlay
}: PlayButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const items = playMenuItems(emulators, preferredEmulatorId)
  const hasMenu = items.length > 1
  const usable = hasMenu && !disabled

  // A row that loses its menu (emulator deleted, request in flight) must not
  // reopen it when it comes back. Adjusting state during render rather than in
  // an effect is React's own advice for reacting to a changed prop.
  const [wasUsable, setWasUsable] = useState(usable)
  if (usable !== wasUsable) {
    setWasUsable(usable)
    if (!usable) setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent): void {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) menu.current?.querySelector('button')?.focus()
  }, [open])

  /** The list scrolls, so a menu on one of the last rows would be clipped;
   *  those open upward instead. */
  function openMenu(): void {
    const anchor = container.current?.getBoundingClientRect()
    const limit = container.current?.closest('.list')?.getBoundingClientRect().bottom
    if (anchor)
      setDropUp(anchor.bottom + items.length * ITEM_HEIGHT + 16 > (limit ?? window.innerHeight))
    setOpen(true)
  }

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>, delta: number): void {
    const buttons = Array.from(menu.current?.querySelectorAll('button') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = buttons[(index + delta + buttons.length) % buttons.length]
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }

  const play = (
    <button
      className="btn primary"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() => onPlay()}
    >
      {label}
    </button>
  )

  if (!hasMenu) return play

  return (
    <div className={`split${dropUp ? ' up' : ''}`} ref={container}>
      <div className="split-main">
        {play}
        <button
          className="btn primary split-toggle"
          disabled={disabled}
          aria-label="Choose an emulator"
          aria-haspopup="menu"
          aria-expanded={open}
          title={disabled ? disabledReason : 'Choose an emulator'}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open) {
              event.preventDefault()
              openMenu()
            }
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <div
          className="menu"
          role="menu"
          ref={menu}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') moveFocus(event, 1)
            else if (event.key === 'ArrowUp') moveFocus(event, -1)
          }}
        >
          {items.map((item) => (
            <button
              key={item.emulator.id}
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onPlay(item.emulator.id)
              }}
            >
              <span className="clip">{item.label}</span>
              {item.tag && <span className="tag">{item.tag}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default PlayButton
