import RomSetup from './components/RomSetup'
import EmulatorSetup from './components/EmulatorSetup'
import CatalogBrowser from './components/CatalogBrowser'

function App(): React.JSX.Element {
  return (
    <main>
      <h1>Ocaris</h1>
      <RomSetup />
      <EmulatorSetup />
      <CatalogBrowser />
    </main>
  )
}

export default App
