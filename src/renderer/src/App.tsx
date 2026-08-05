import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import FilterChips from './components/FilterChips'
import ModList from './components/ModList'
import EmptyState from './components/EmptyState'
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
  const [groupByState, setGroupByState] = useState(false)

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

  const promptedForRom = useRef(false)

  useEffect(() => {
    void loadMods()
    void loadStats()
    void window.api.emulator.list().then(setEmulators)
    void window.api.rom.getConfig().then((config) => {
      setRomConfig(config)
      // First run: nothing in the library is usable without a ROM, so open
      // settings on that pane rather than leaving the user to find the gear.
      if (!config.romPath && !promptedForRom.current) {
        promptedForRom.current = true
        setSettings({ open: true, pane: 'rom' })
      }
    })
  }, [loadMods, loadStats])

  const anyDownloading = mods.some((mod) => mod.status.state === 'downloading')
  useEffect(() => {
    if (!anyDownloading) return
    const interval = setInterval(() => void loadMods(), PROGRESS_POLL_MS)
    return () => clearInterval(interval)
  }, [anyDownloading, loadMods])

  const romConfigured = Boolean(romConfig?.romPath)
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

  /**
   * A missing ROM blocks everything, so it gets the whole view. A missing
   * emulator does not: mods still browse and download, and only Play is
   * disabled (see actionsFor).
   */
  function body(): React.JSX.Element {
    if (romConfig && !romConfig.romPath) {
      return (
        <EmptyState
          title="Add your Ocarina of Time ROM"
          body="Ocaris patches a copy of your own ROM to install mods. Nothing else works until it knows where that file is."
          action={{ label: 'Choose ROM file…', onClick: () => openSettings('rom') }}
        />
      )
    }

    if (mods.length === 0) {
      return (
        <EmptyState
          title="No mods cached yet"
          body="Fetch the catalog to see what's available. The list is stored locally, so this only needs an internet connection when you refresh."
          action={{
            label: refreshing ? 'Refreshing…' : 'Refresh catalog',
            onClick: () => void handleRefresh()
          }}
        />
      )
    }

    if (visible.length === 0) {
      return (
        <EmptyState
          title="No mods match"
          body={
            query.trim()
              ? `Nothing in this filter matches “${query.trim()}”.`
              : 'Nothing in the catalog is in this state right now.'
          }
          action={{
            label: 'Clear filters',
            onClick: () => {
              setFilter('all')
              setQuery('')
            }
          }}
        />
      )
    }

    return (
      <ModList
        mods={visible}
        groupByState={groupByState}
        busyIds={busyIds}
        context={{ hasEmulator: emulators.length > 0 }}
        onAction={(action, mod) => void handleAction(action, mod)}
      />
    )
  }

  return (
    <div className="app">
      <TopBar>
        <div className="spacer" />
        {romConfigured && mods.length > 0 && (
          <input
            className="search"
            value={query}
            placeholder="Search mods or authors…"
            aria-label="Search mods"
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
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

      {/* Both are noise while the ROM empty state owns the view. */}
      {romConfigured && mods.length > 0 && (
        <FilterChips
          active={filter}
          counts={counts}
          sort={sort}
          groupByState={groupByState}
          onFilterChange={setFilter}
          onSortChange={setSort}
          onGroupByStateChange={setGroupByState}
        />
      )}

      {body()}

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
