import { useEffect, useState } from 'react'
import CatalogBrowser from './components/CatalogBrowser'
import TopBar from './components/TopBar'
import SettingsDialog, { type SettingsPane } from './components/settings/SettingsDialog'
import type { Emulator, RomConfig } from '@shared/ipc'

function App(): React.JSX.Element {
  const [romConfig, setRomConfig] = useState<RomConfig | null>(null)
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [settings, setSettings] = useState<{ open: boolean; pane: SettingsPane }>({
    open: false,
    pane: 'appearance'
  })

  // The settings panes report changes back up, but the shell needs this state
  // before the dialog has ever been opened.
  useEffect(() => {
    void window.api.rom.getConfig().then(setRomConfig)
    void window.api.emulator.list().then(setEmulators)
  }, [])

  function openSettings(pane: SettingsPane): void {
    setSettings({ open: true, pane })
  }

  const romConfigured = Boolean(romConfig?.romPath)
  const hasEmulator = emulators.length > 0

  return (
    <div className="app">
      <TopBar>
        <div className="spacer" />
        <button className="btn icon" onClick={() => openSettings('appearance')} title="Settings">
          ⚙
        </button>
      </TopBar>

      {/* Replaced by the library list in the next commit. */}
      <main className="legacy-body">
        {!romConfigured && (
          <p>
            No ROM configured yet.{' '}
            <button className="btn sm" onClick={() => openSettings('rom')}>
              Add your ROM
            </button>
          </p>
        )}
        {romConfigured && !hasEmulator && (
          <p>
            No emulator configured yet.{' '}
            <button className="btn sm" onClick={() => openSettings('emulators')}>
              Add an emulator
            </button>
          </p>
        )}
        {romConfigured && hasEmulator && <CatalogBrowser />}
      </main>

      <SettingsDialog
        open={settings.open}
        initialPane={settings.pane}
        onClose={() => setSettings((s) => ({ ...s, open: false }))}
        onRomConfigChange={setRomConfig}
        onEmulatorsChange={setEmulators}
      />
    </div>
  )
}

export default App
