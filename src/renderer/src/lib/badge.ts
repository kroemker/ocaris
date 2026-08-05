/**
 * Deterministic gradient hue + initials for a placeholder badge, so a given
 * id always renders the same way instead of flickering between renders.
 * Shared by ModThumbnail (mod screenshots) and EmulatorIcon (known-emulator
 * tiles), which don't have real artwork to fall back from/to respectively.
 */
export function hueFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360
  }
  return hash
}

export function initials(name: string): string {
  return name
    .split(/[\s:&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
