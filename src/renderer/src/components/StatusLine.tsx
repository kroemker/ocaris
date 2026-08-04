import type { Emulator, RomConfig } from '@shared/ipc'

interface StatusLineProps {
  visibleCount: number
  totalCount: number
  romConfig: RomConfig | null
  emulators: readonly Emulator[]
  refreshedAt: number | null
}

function formatWhen(timestamp: number | null): string {
  if (!timestamp) return 'catalog never refreshed'
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'refreshed just now'
  if (minutes < 60) return `refreshed ${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `refreshed ${hours}h ago`
  return `refreshed ${new Date(timestamp).toLocaleDateString()}`
}

function StatusLine({
  visibleCount,
  totalCount,
  romConfig,
  emulators,
  refreshedAt
}: StatusLineProps): React.JSX.Element {
  const defaultEmulator = emulators.find((emulator) => emulator.isDefault) ?? emulators[0]

  return (
    <footer className="statusline">
      <span>
        {visibleCount === totalCount
          ? `${totalCount} mod${totalCount === 1 ? '' : 's'}`
          : `${visibleCount} of ${totalCount} mods`}
      </span>

      <span>·</span>
      {romConfig?.romPath ? (
        <span className={romConfig.romVerified ? 'ok' : undefined}>
          {romConfig.romVerified ? 'ROM verified' : 'ROM unverified'}
        </span>
      ) : (
        <span>no ROM</span>
      )}

      <span>·</span>
      <span>{defaultEmulator ? defaultEmulator.name : 'no emulator'}</span>

      <span className="spacer" />
      <span>{formatWhen(refreshedAt)}</span>
    </footer>
  )
}

export default StatusLine
