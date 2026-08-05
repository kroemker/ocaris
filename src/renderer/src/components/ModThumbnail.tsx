import { useState } from 'react'
import type { ModSummary } from '@shared/ipc'
import { hueFor, initials } from '../lib/badge'

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
