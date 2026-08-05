import { useCallback, useEffect, useState } from 'react'
import type { CatalogSourceResult, CatalogStats } from '@shared/ipc'

interface CatalogPaneProps {
  onRefreshed?: () => void
}

function formatWhen(timestamp: number | null): string {
  if (!timestamp) return 'never'
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return new Date(timestamp).toLocaleDateString()
}

function CatalogPane({ onRefreshed }: CatalogPaneProps): React.JSX.Element {
  const [stats, setStats] = useState<CatalogStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState<CatalogSourceResult[]>([])

  const load = useCallback((): Promise<void> => {
    return window.api.catalog.stats().then(setStats)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRefresh(): Promise<void> {
    setBusy(true)
    setError(null)
    setFailures([])
    try {
      const result = await window.api.catalog.refresh()
      setFailures(result.sources.filter((source) => source.errorMessage !== null))
      await load()
      onRefreshed?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="sec-title">Catalog</h3>

      <div className="field">
        <label>Sources</label>
        <div className="ctl">
          {/* Both sources are always fetched and merged into one row per mod,
              so there's nothing to pick between - they're listed, not chosen. */}
          <span className="hint">hylianmodding.com · Zelda 64 Mods Wiki</span>
          <button className="btn" onClick={() => void handleRefresh()} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
        <p className="hint">
          {stats
            ? `${stats.count} mods cached · last refreshed ${formatWhen(stats.refreshedAt)}`
            : 'Loading…'}
        </p>
      </div>

      {/* A source that's down is reported on its own: the other one still
          refreshed, so this is a warning rather than a failed refresh. */}
      {failures.map((failure) => (
        <p className="hint err" role="alert" key={failure.source}>
          Couldn&apos;t reach {failure.source}: {failure.errorMessage}
        </p>
      ))}

      {error && (
        <p className="hint err" role="alert">
          Couldn&apos;t refresh the catalog: {error}
        </p>
      )}
    </>
  )
}

export default CatalogPane
