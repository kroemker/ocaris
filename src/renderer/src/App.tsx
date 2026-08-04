import { useState } from 'react'
import RomSetup from './components/RomSetup'
import EmulatorSetup from './components/EmulatorSetup'
import CatalogBrowser from './components/CatalogBrowser'
import TopBar from './components/TopBar'
import { useTheme } from './theme/useTheme'
import type { Emulator, RomConfig } from '@shared/ipc'

function App(): React.JSX.Element {
  const [romConfig, setRomConfig] = useState<RomConfig | null>(null)
  const [emulators, setEmulators] = useState<Emulator[]>([])

  // Sets data-theme on <html>; the Appearance pane lands in a later step.
  useTheme()

  const romConfigured = Boolean(romConfig?.romPath)
  const hasEmulator = emulators.length > 0

  return (
    <div className="app">
      <TopBar />

      {/* Setup still lives inline here; it moves into the settings dialog next. */}
      <main className="legacy-body">
        <RomSetup onConfigChange={setRomConfig} />

        {romConfigured ? (
          <EmulatorSetup onChange={setEmulators} />
        ) : (
          <p>Configure your ROM above to continue setup.</p>
        )}

        {romConfigured && hasEmulator && <CatalogBrowser />}
        {romConfigured && !hasEmulator && (
          <p>Configure at least one emulator above to browse and play mods.</p>
        )}
      </main>
    </div>
  )
}

export default App
