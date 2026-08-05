import { useEffect, useState } from 'react'
import type { RomConfig, RomVerification } from '@shared/ipc'

interface PendingSelection {
  path: string
  verification: RomVerification
}

interface RomPaneProps {
  onConfigChange?: (config: RomConfig) => void
}

function RomPane({ onConfigChange }: RomPaneProps): React.JSX.Element {
  const [config, setConfig] = useState<RomConfig | null>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyConfig(next: RomConfig): void {
    setConfig(next)
    onConfigChange?.(next)
  }

  useEffect(() => {
    void window.api.rom.getConfig().then(applyConfig)
    // onConfigChange intentionally omitted: this should only run once on
    // mount, not whenever the parent passes a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        applyConfig(updated)
        setPending(null)
      } else {
        // A CRC mismatch is a warning, not a block - the user gets to decide.
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
      applyConfig(updated)
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="sec-title">ROM</h3>

      <div className="field">
        <label htmlFor="rom-path">ROM file — Ocarina of Time 1.0 (U)</label>
        <div className="ctl">
          <input
            id="rom-path"
            readOnly
            value={config?.romPath ?? ''}
            placeholder="No ROM configured yet"
          />
          <button className="btn" onClick={() => void handleSelectFile()} disabled={busy}>
            Browse…
          </button>
        </div>

        {config?.romPath && (
          <div className="hint">
            {config.romVerified ? (
              <span className="pill ok">✓ Header CRC verified</span>
            ) : (
              <span className="pill warn">Unverified — confirmed by you</span>
            )}
            {config.romVariant && <span>{config.romVariant}</span>}
          </div>
        )}
      </div>

      {pending && (
        <div className="field" role="alert">
          <p className="hint err">
            <strong>Header CRC mismatch.</strong> This file&apos;s header CRC (
            {pending.verification.headerCrcHex}) doesn&apos;t match any known-good OoT 1.0 (U)
            pattern. It may be a different game, a different version or region, or a bad dump.
          </p>
          <div className="ctl">
            <button className="btn" onClick={() => void handleUseAnyway()} disabled={busy}>
              Use anyway
            </button>
            <button className="btn ghost" onClick={() => setPending(null)} disabled={busy}>
              Choose a different file
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="hint err" role="alert">
          {error}
        </p>
      )}

      <p className="hint">
        Ocaris never modifies this file — it copies it into its own storage the moment you confirm
        it, so patching keeps working even if you later move, rename, or delete the original.
      </p>
    </>
  )
}

export default RomPane
