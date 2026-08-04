import { useEffect, useState } from 'react'
import type { Emulator, ModSummary } from '@shared/ipc'

type Filter = 'all' | 'library'

function formatProgress(status: ModSummary['status']): string {
  const { downloadProgressBytes, downloadTotalBytes } = status
  if (downloadTotalBytes) {
    const percent = Math.round(((downloadProgressBytes ?? 0) / downloadTotalBytes) * 100)
    return `Downloading… ${percent}%`
  }
  if (downloadProgressBytes) {
    return `Downloading… ${Math.round(downloadProgressBytes / 1024)} KB`
  }
  return 'Downloading…'
}

function CatalogBrowser(): React.JSX.Element {
  const [mods, setMods] = useState<ModSummary[]>([])
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  function loadMods(): Promise<void> {
    return window.api.catalog.list().then(setMods)
  }

  function loadEmulators(): Promise<void> {
    return window.api.emulator.list().then(setEmulators)
  }

  useEffect(() => {
    void loadMods()
    void loadEmulators()
  }, [])

  useEffect(() => {
    const anyDownloading = mods.some((mod) => mod.status.state === 'downloading')
    if (!anyDownloading) return
    const interval = setInterval(() => void loadMods(), 750)
    return () => clearInterval(interval)
  }, [mods])

  async function handleRefreshCatalog(): Promise<void> {
    setRefreshing(true)
    setError(null)
    try {
      await window.api.catalog.refresh()
      await loadMods()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleInstall(modId: string): Promise<void> {
    setBusyIds((prev) => new Set(prev).add(modId))
    try {
      await window.api.catalog.install(modId)
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(modId)
        return next
      })
      await loadMods()
    }
  }

  const defaultEmulator = emulators.find((emulator) => emulator.isDefault) ?? emulators[0]

  async function handlePlay(mod: ModSummary): Promise<void> {
    if (!defaultEmulator || !mod.status.patchedRomPath) return
    setPlayError(null)
    try {
      await window.api.emulator.launch(defaultEmulator.id, mod.status.patchedRomPath)
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : String(err))
    }
  }

  const visibleMods = filter === 'library' ? mods.filter((m) => m.status.state === 'ready') : mods

  return (
    <section>
      <h2>Mod catalog</h2>

      <button onClick={() => void handleRefreshCatalog()} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh catalog'}
      </button>
      <button onClick={() => setFilter('all')} disabled={filter === 'all'}>
        Browse all
      </button>
      <button onClick={() => setFilter('library')} disabled={filter === 'library'}>
        My library
      </button>

      {error && <p role="alert">Error refreshing catalog: {error}</p>}
      {playError && <p role="alert">Couldn&apos;t launch emulator: {playError}</p>}
      {emulators.length === 0 && <p>Configure an emulator above before playing a mod.</p>}

      {visibleMods.length === 0 ? (
        <p>
          {filter === 'library'
            ? 'No mods installed yet - switch to "Browse all" to find one.'
            : 'No mods cached yet. Click "Refresh catalog" to fetch the list.'}
        </p>
      ) : (
        <ul>
          {visibleMods.map((mod) => {
            const busy = busyIds.has(mod.id)
            return (
              <li key={mod.id}>
                <strong>{mod.name}</strong>
                {mod.author && ` by ${mod.author}`}
                {mod.completionStatus && ` · ${mod.completionStatus}`}
                {mod.description && <p>{mod.description}</p>}

                {mod.status.state === 'not_downloaded' && (
                  <button
                    onClick={() => void handleInstall(mod.id)}
                    disabled={busy || !mod.downloadLink}
                  >
                    Download
                  </button>
                )}

                {mod.status.state === 'downloading' && <p>{formatProgress(mod.status)}</p>}

                {mod.status.state === 'ready' && (
                  <button onClick={() => void handlePlay(mod)} disabled={!defaultEmulator}>
                    Play
                  </button>
                )}

                {mod.status.state === 'error' && (
                  <div role="alert">
                    <p>{mod.status.errorMessage}</p>
                    {mod.downloadLink && (
                      <button
                        onClick={() =>
                          void window.api.shell.openExternal(mod.downloadLink as string)
                        }
                      >
                        Open download page
                      </button>
                    )}
                    <button onClick={() => void handleInstall(mod.id)} disabled={busy}>
                      Retry
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default CatalogBrowser
