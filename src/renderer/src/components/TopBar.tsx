interface TopBarProps {
  /** Rendered to the right of the brand; interactive children opt out of the
   *  window drag region via the .topbar rules in app.css. */
  children?: React.ReactNode
}

/**
 * Doubles as the window's title bar - see the .topbar rules in app.css for the
 * drag region and the insets that keep content clear of the window controls.
 */
function TopBar({ children }: TopBarProps): React.JSX.Element {
  return (
    <header className="topbar">
      <div className="brand">
        Ocaris
        <small>Mod launcher</small>
      </div>
      {children}
    </header>
  )
}

export default TopBar
