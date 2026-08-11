import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar from './components/TopBar'
import FilterChips from './components/FilterChips'
import ModList from './components/ModList'
import EmptyState from './components/EmptyState'
import StatusLine from './components/StatusLine'
import SettingsDialog, { type SettingsPane } from './components/settings/SettingsDialog'
import ModDetails from './components/ModDetails'
import {
  countsByFilter,
  emulatorForMod,
  pageLink,
  visibleMods,
  type ModActionId
} from './lib/library'
import { useUiState } from './lib/useUiState'
import type { Emulator, ModSummary, RomConfig } from '@shared/ipc'

function App(): React.JSX.Element {
  const [mods, setMods] = useState<ModSummary[]>([])
  const [romConfig, setRomConfig] = useState<RomConfig | null>(null)
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const ui = useUiState()
  const { filter, sort, query, groupByState } = ui.state.library

  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<{ open: boolean; pane: SettingsPane }>({
    open: false,
    pane: 'appearance'
  })
  // The dialog follows the mod by id rather than holding a copy, so a row that
  // finishes downloading updates underneath it.
  const [detailsId, setDetailsId] = useState<string | null>(null)

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

  // Ids with an install request in flight. busyIds says the same thing, but a
  // long-lived event listener can't read state - and a progress event that
  // arrives just after a cancel must not put the row back into 'downloading'.
  const installing = useRef<ReadonlySet<string>>(new Set())

  // Progress is pushed by main for the mod being installed, so the list neither
  // polls nor re-reads the whole catalog to move a progress bar.
  useEffect(() => {
    return window.api.mod.onProgress((progress) => {
      if (!installing.current.has(progress.modId)) return
      setMods((previous) =>
        previous.map((mod) =>
          mod.id === progress.modId
            ? {
                ...mod,
                status: {
                  ...mod.status,
                  // The first event is also how a row learns it started: the
                  // status it was rendered with still says 'not_downloaded'.
                  state: 'downloading',
                  downloadProgressBytes: progress.downloadProgressBytes,
                  downloadTotalBytes: progress.downloadTotalBytes
                }
              }
            : mod
        )
      )
    })
  }, [])

  const romConfigured = Boolean(romConfig?.romPath)
  const view = useMemo(() => ({ filter, query, sort }), [filter, query, sort])
  const visible = useMemo(() => visibleMods(mods, view), [mods, view])
  const counts = useMemo(() => countsByFilter(mods, query), [mods, query])

  function markBusy(modId: string, busy: boolean): void {
    const next = new Set(installing.current)
    if (busy) next.add(modId)
    else next.delete(modId)
    installing.current = next
    setBusyIds(next)
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

  /** emulatorId comes from the Play menu; without one, Play uses whichever
   *  emulator this mod resolves to. */
  async function handleAction(
    action: ModActionId,
    mod: ModSummary,
    emulatorId?: number
  ): Promise<void> {
    setError(null)

    // Opening the dialog is renderer-only: no IPC, and nothing to reload.
    if (action === 'details') {
      setDetailsId(mod.id)
      return
    }

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

        case 'play': {
          const target =
            emulatorId === undefined
              ? emulatorForMod(mod, emulators)
              : emulators.find((e) => e.id === emulatorId)
          if (!target || !mod.status.patchedRomPath) return
          await window.api.emulator.launch(target.id, mod.status.patchedRomPath)
          // Picking from the menu is also how a mod's emulator gets set: the
          // next bare Play click uses the same one.
          if (emulatorId !== undefined && emulatorId !== mod.prefs.emulatorId) {
            await window.api.mod.setPrefs(mod.id, { emulatorId })
          }
          break
        }

        case 'toggleFavorite':
          await window.api.mod.setPrefs(mod.id, { favorite: !mod.prefs.favorite })
          break

        case 'toggleHidden':
          await window.api.mod.setPrefs(mod.id, { hidden: !mod.prefs.hidden })
          break

        case 'remove':
          await window.api.mod.remove(mod.id)
          break

        case 'reveal':
          await window.api.mod.reveal(mod.id)
          break

        case 'openPage': {
          const url = pageLink(mod)
          if (url) await window.api.shell.openExternal(url)
          break
        }
      }
    } catch (err) {
      setError(`${mod.name}: ${describe(err)}`)
    } finally {
      await loadMods()
    }
  }

  /** Without a pane, the dialog reopens where the user left it last run. An
   *  explicit pane is a prompt about something specific and doesn't become the
   *  remembered one - only picking a section in the dialog's nav does. */
  function openSettings(pane?: SettingsPane): void {
    setSettings({ open: true, pane: pane ?? ui.state.settingsPane })
  }

  /**
   * A missing ROM blocks everything, so it gets the whole view. A missing
   * emulator does not: mods still browse and download, and only Play is
   * disabled (see actionsFor).
   */
  function body(): React.JSX.Element {
    // The stored filter/sort/search arrive a tick after the first paint.
    // Rendering the list against the defaults first would show the wrong rows
    // and then snap, so it waits - the catalog is still loading anyway.
    if (!ui.loaded) return <div className="list" aria-busy="true" />

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
            onClick: () => ui.setLibrary({ filter: 'all', query: '' })
          }}
        />
      )
    }

    return (
      <ModList
        mods={visible}
        groupByState={groupByState}
        busyIds={busyIds}
        context={{ emulators }}
        onAction={(action, mod, emulatorId) => void handleAction(action, mod, emulatorId)}
      />
    )
  }

  return (
    <div className="app">
      <TopBar>
        <div className="spacer" />
        {ui.loaded && romConfigured && mods.length > 0 && (
          <input
            className="search"
            value={query}
            placeholder="Search mods or authors…"
            aria-label="Search mods"
            onChange={(e) => ui.setLibrary({ query: e.target.value })}
          />
        )}
        <button className="btn" onClick={() => void handleRefresh()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh catalog'}
        </button>
        <button className="btn icon" onClick={() => openSettings()} title="Settings">
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
      {ui.loaded && romConfigured && mods.length > 0 && (
        <FilterChips
          active={filter}
          counts={counts}
          sort={sort}
          groupByState={groupByState}
          onFilterChange={(next) => ui.setLibrary({ filter: next })}
          onSortChange={(next) => ui.setLibrary({ sort: next })}
          onGroupByStateChange={(next) => ui.setLibrary({ groupByState: next })}
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

      <ModDetails
        mod={mods.find((mod) => mod.id === detailsId) ?? null}
        context={{ emulators, busy: detailsId !== null && busyIds.has(detailsId) }}
        onClose={() => setDetailsId(null)}
        onAction={(action, mod, emulatorId) => void handleAction(action, mod, emulatorId)}
        onEmulatorChange={(mod, id) => {
          void window.api.mod.setPrefs(mod.id, { emulatorId: id }).then(() => loadMods())
        }}
      />

      <SettingsDialog
        open={settings.open}
        initialPane={settings.pane}
        onPaneChange={ui.setSettingsPane}
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
