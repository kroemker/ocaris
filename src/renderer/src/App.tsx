import RomSetup from './components/RomSetup'
import EmulatorSetup from './components/EmulatorSetup'

function App(): React.JSX.Element {
  return (
    <main>
      <h1>Ocaris</h1>
      <RomSetup />
      <EmulatorSetup />
    </main>
  )
}

export default App
