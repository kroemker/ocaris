import { hueFor, initials } from '../../lib/badge'

/**
 * Small placeholder badge for a known emulator - not an official logo (no
 * verified-license artwork to bundle for these), same gradient+initials
 * technique as ModThumbnail's fallback tile. Keyed by knownId so real icons
 * can replace this per-entry later without touching call sites.
 */
function EmulatorIcon({ knownId, name }: { knownId: string; name: string }): React.JSX.Element {
  const hue = hueFor(knownId)
  return (
    <div
      className="emu-icon"
      style={
        {
          '--c1': `hsl(${hue} 55% 45%)`,
          '--c2': `hsl(${(hue + 40) % 360} 50% 30%)`
        } as React.CSSProperties
      }
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

export default EmulatorIcon
