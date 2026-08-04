import { useEffect, useState } from 'react'
import type { RomConfig, RomVerification } from '@shared/ipc'

interface PendingSelection {
  path: string
  verification: RomVerification
}

function RomSetup(): React.JSX.Element {
  const [config, setConfig] = useState<RomConfig | null>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.rom.getConfig().then(setConfig)
  }, [])

  async function handleSelectFile(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const path = await window.api.rom.selectFile()
      if (!path) return

      const verification = await window.api.rom.verify(path)

      if (verification.verified) {
        const updated = await window.api.rom.confirm({
          romPath: path,
          variant: verification.variant,
          verified: true
        })
        setConfig(updated)
        setPending(null)
      } else {
        setPending({ path, verification })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleUseAnyway(): Promise<void> {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const updated = await window.api.rom.confirm({
        romPath: pending.path,
        variant: pending.verification.variant,
        verified: false
      })
      setConfig(updated)
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Base ROM</h2>

      {config?.romPath ? (
        <p>
          <strong>{config.romVerified ? 'Verified' : 'Using unverified override'}:</strong>{' '}
          {config.romPath}
          {config.romVariant && ` (${config.romVariant})`}
        </p>
      ) : (
        <p>No ROM configured yet.</p>
      )}

      <button onClick={() => void handleSelectFile()} disabled={busy}>
        {config?.romPath ? 'Select a different ROM' : 'Select ROM File'}
      </button>

      {pending && (
        <div role="alert">
          <p>
            <strong>Header CRC mismatch.</strong> This file's header CRC (
            {pending.verification.headerCrcHex}) doesn't match any known-good OoT 1.0 (U) pattern.
            It may be a different ROM, a different version/region, or a bad dump.
          </p>
          <button onClick={() => void handleUseAnyway()} disabled={busy}>
            Use anyway
          </button>
          <button onClick={() => setPending(null)} disabled={busy}>
            Choose a different file
          </button>
        </div>
      )}

      {error && <p role="alert">Error: {error}</p>}
    </section>
  )
}

export default RomSetup
