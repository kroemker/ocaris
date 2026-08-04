import { useState } from 'react'
import type { ModSummary } from '@shared/ipc'

/**
 * Deterministic gradient for the placeholder tile, so a given mod always gets
 * the same colors instead of flickering between renders.
 */
function hueFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360
  }
  return hash
}

function initials(name: string): string {
  return name
    .split(/[\s:&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

/**
 * 4:3 box - the N64's native ratio and the majority of what the catalog
 * serves. Wider screenshots are cropped to fit rather than letterboxed.
 */
function ModThumbnail({ mod }: { mod: ModSummary }): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  if (!mod.thumbnailUrl || failed) {
    const hue = hueFor(mod.id)
    return (
      <div
        className="thumb placeholder"
        style={
          {
            '--c1': `hsl(${hue} 55% 45%)`,
            '--c2': `hsl(${(hue + 40) % 360} 50% 30%)`
          } as React.CSSProperties
        }
        aria-hidden
      >
        {initials(mod.name)}
      </div>
    )
  }

  return (
    <div className="thumb">
      <img src={mod.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  )
}

export default ModThumbnail
