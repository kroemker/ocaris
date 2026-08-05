import { useCallback, useEffect, useState } from 'react'
import type { CatalogStats } from '@shared/ipc'

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

  const load = useCallback((): Promise<void> => {
    return window.api.catalog.stats().then(setStats)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRefresh(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.api.catalog.refresh()
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
        <label htmlFor="catalog-source">Source</label>
        <div className="ctl">
          {/* Only one ModCatalogSource exists so far; the control is here so
              the shape is obvious once a second one lands. */}
          <select id="catalog-source" disabled>
            <option>hylianmodding.com</option>
          </select>
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

      {error && (
        <p className="hint err" role="alert">
          Couldn&apos;t refresh the catalog: {error}
        </p>
      )}
    </>
  )
}

export default CatalogPane
