import { useCallback, useEffect, useMemo, useState } from 'react'
import TopBar from './components/TopBar'
import FilterChips from './components/FilterChips'
import ModList from './components/ModList'
import StatusLine from './components/StatusLine'
import SettingsDialog, { type SettingsPane } from './components/settings/SettingsDialog'
import {
  countsByFilter,
  visibleMods,
  type LibraryFilter,
  type LibrarySort,
  type ModActionId
} from './lib/library'
import type { Emulator, ModSummary, RomConfig } from '@shared/ipc'

/** How often the list re-reads while a download is running. installMod writes
 *  progress to mod_status on every chunk, so polling is enough. */
const PROGRESS_POLL_MS = 750

function App(): React.JSX.Element {
  const [mods, setMods] = useState<ModSummary[]>([])
  const [romConfig, setRomConfig] = useState<RomConfig | null>(null)
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [sort, setSort] = useState<LibrarySort>('name')
  const [query, setQuery] = useState('')

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<{ open: boolean; pane: SettingsPane }>({
    open: false,
    pane: 'appearance'
  })

  const loadMods = useCallback((): Promise<void> => {
    return window.api.catalog.list().then(setMods)
  }, [])

  const loadStats = useCallback((): Promise<void> => {
    return window.api.catalog.stats().then((stats) => setRefreshedAt(stats.refreshedAt))
  }, [])

  useEffect(() => {
    void loadMods()
    void loadStats()
    void window.api.rom.getConfig().then(setRomConfig)
    void window.api.emulator.list().then(setEmulators)
  }, [loadMods, loadStats])

  const anyDownloading = mods.some((mod) => mod.status.state === 'downloading')
  useEffect(() => {
    if (!anyDownloading) return
    const interval = setInterval(() => void loadMods(), PROGRESS_POLL_MS)
    return () => clearInterval(interval)
  }, [anyDownloading, loadMods])

  const view = useMemo(() => ({ filter, query, sort }), [filter, query, sort])
  const visible = useMemo(() => visibleMods(mods, view), [mods, view])
  const counts = useMemo(() => countsByFilter(mods, query), [mods, query])

  function markBusy(modId: string, busy: boolean): void {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(modId)
      else next.delete(modId)
      return next
    })
  }

  async function handleRefresh(): Promise<void> {
    setRefreshing(true)
    setError(null)
    try {
      await window.api.catalog.refresh()
      await Promise.all([loadMods(), loadStats()])
    } catch (err) {
      setError(`Couldn't refresh the catalog: ${describe(err)}`)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleAction(action: ModActionId, mod: ModSummary): Promise<void> {
    setError(null)
    const defaultEmulator = emulators.find((e) => e.isDefault) ?? emulators[0]

    try {
      switch (action) {
        case 'download':
        case 'retry':
          markBusy(mod.id, true)
          try {
            await window.api.catalog.install(mod.id)
          } finally {
            markBusy(mod.id, false)
          }
          break

        case 'cancel':
          await window.api.mod.cancel(mod.id)
          break

        case 'play':
          if (!defaultEmulator || !mod.status.patchedRomPath) return
          await window.api.emulator.launch(defaultEmulator.id, mod.status.patchedRomPath)
          break

        case 'remove':
          await window.api.mod.remove(mod.id)
          break

        case 'reveal':
          await window.api.mod.reveal(mod.id)
          break

        case 'openPage':
          if (mod.downloadLink) await window.api.shell.openExternal(mod.downloadLink)
          break
      }
    } catch (err) {
      setError(`${mod.name}: ${describe(err)}`)
    } finally {
      await loadMods()
    }
  }

  function openSettings(pane: SettingsPane): void {
    setSettings({ open: true, pane })
  }

  return (
    <div className="app">
      <TopBar>
        <div className="spacer" />
        <input
          className="search"
          value={query}
          placeholder="Search mods or authors…"
          aria-label="Search mods"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh catalog'}
        </button>
        <button className="btn icon" onClick={() => openSettings('appearance')} title="Settings">
          ⚙
        </button>
      </TopBar>

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <FilterChips
        active={filter}
        counts={counts}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
      />

      <ModList
        mods={visible}
        busyIds={busyIds}
        context={{ hasEmulator: emulators.length > 0 }}
        onAction={(action, mod) => void handleAction(action, mod)}
      />

      <StatusLine
        visibleCount={visible.length}
        totalCount={mods.length}
        romConfig={romConfig}
        emulators={emulators}
        refreshedAt={refreshedAt}
      />

      <SettingsDialog
        open={settings.open}
        initialPane={settings.pane}
        onClose={() => setSettings((s) => ({ ...s, open: false }))}
        onRomConfigChange={setRomConfig}
        onEmulatorsChange={setEmulators}
        onCatalogRefreshed={() => {
          void loadMods()
          void loadStats()
        }}
      />
    </div>
  )
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default App
