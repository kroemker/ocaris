import { useTheme } from '../../../theme/ThemeContext'
import type { ThemeSource } from '@shared/ipc'

/**
 * Palettes for the card previews. Deliberately hardcoded rather than read from
 * the CSS tokens: the Light card has to look light while the dark theme is
 * active, so it can't inherit the live variables.
 */
const PALETTE = {
  dark: { bg: '#0f1116', bg2: '#151922', line: '#262c38', fg: '#e6e8ee', accent: '#5b8cff' },
  light: { bg: '#ffffff', bg2: '#f7f8fb', line: '#dce0e9', fg: '#171a21', accent: '#3568e0' }
} as const

type Palette = (typeof PALETTE)[keyof typeof PALETTE]

function Preview({ p }: { p: Palette }): React.JSX.Element {
  return (
    <div className="prev" style={{ background: p.bg }}>
      <div className="p-bar" style={{ background: p.bg2, borderBottom: `1px solid ${p.line}` }}>
        <i style={{ background: p.fg, opacity: 0.7 }} />
        <i style={{ background: p.accent, marginLeft: 'auto', width: 10 }} />
      </div>
      <div className="p-body">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="p-row"
            style={{ background: p.bg2, border: `1px solid ${p.line}` }}
          >
            <b style={{ background: p.accent, opacity: 0.9 - i * 0.25 }} />
            <s style={{ background: p.fg, opacity: 0.35 }} />
            <u style={{ background: i === 0 ? p.accent : p.line }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AppearancePane(): React.JSX.Element {
  const { pref, resolved, setPref } = useTheme()

  const options: ReadonlyArray<{ id: ThemeSource; label: string; sub: string; palette: Palette }> =
    [
      {
        id: 'system',
        label: 'System',
        sub: `Follows the OS — currently ${resolved}`,
        palette: PALETTE[resolved]
      },
      { id: 'light', label: 'Light', sub: 'Midnight Light', palette: PALETTE.light },
      { id: 'dark', label: 'Dark', sub: 'Midnight', palette: PALETTE.dark }
    ]

  return (
    <>
      <h3 className="sec-title">Appearance</h3>

      <div className="themes" role="radiogroup" aria-label="Theme">
        {options.map((option) => (
          <button
            key={option.id}
            className={`theme-opt${option.id === pref ? ' on' : ''}`}
            role="radio"
            aria-checked={option.id === pref}
            onClick={() => void setPref(option.id)}
          >
            <Preview p={option.palette} />
            <span className="lbl">
              <span className="radio" />
              {option.label}
            </span>
            <span className="sub">{option.sub}</span>
          </button>
        ))}
      </div>

      <p className="hint">Applies immediately and is stored with the rest of the app config.</p>
    </>
  )
}

export default AppearancePane
