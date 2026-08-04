import { useState } from 'react'
import type { AppPingResponse } from '@shared/ipc'

function App(): React.JSX.Element {
  const [pingResult, setPingResult] = useState<AppPingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePing(): Promise<void> {
    setError(null)
    try {
      const result = await window.api.ping()
      setPingResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main>
      <h1>Ocaris</h1>
      <p>Electron + React + TypeScript shell (WP0).</p>

      <button onClick={() => void handlePing()}>Ping main process</button>

      {pingResult && (
        <dl>
          <dt>Response</dt>
          <dd>{pingResult.message}</dd>
          <dt>SQLite DB path</dt>
          <dd>{pingResult.dbPath}</dd>
          <dt>Timestamp</dt>
          <dd>{new Date(pingResult.timestamp).toISOString()}</dd>
        </dl>
      )}

      {error && <p role="alert">IPC error: {error}</p>}
    </main>
  )
}

export default App
