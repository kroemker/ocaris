import { useEffect, useState } from 'react'
import type { StorageUsage } from '@shared/ipc'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const mb = bytes / 1024 / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function StoragePane(): React.JSX.Element {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.storage.usage().then(setUsage)
  }, [])

  async function relocate(path: string | null): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      setUsage(await window.api.storage.setLocation(path))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleChangeLocation(): Promise<void> {
    const folder = await window.api.storage.selectFolder()
    if (folder) await relocate(folder)
  }

  return (
    <>
      <h3 className="sec-title">Storage</h3>

      <div className="field">
        <label htmlFor="storage-root">Storage location</label>
        <div className="ctl">
          <input id="storage-root" readOnly value={usage?.storageRoot ?? ''} />
          <button className="btn" onClick={() => void handleChangeLocation()} disabled={busy}>
            Change…
          </button>
          {usage && !usage.isDefaultLocation && (
            <button className="btn" onClick={() => void relocate(null)} disabled={busy}>
              Reset to default
            </button>
          )}
        </div>
        <p className="hint">
          Your base ROM, cached patches, and patched ROMs are kept here, under <code>base/</code>,{' '}
          <code>patches/</code>, and <code>roms/</code>. Point it at a folder next to the app itself
          to keep everything together and portable — existing files are moved automatically.
        </p>
      </div>

      {error && (
        <p className="hint err" role="alert">
          {error}
        </p>
      )}

      <div className="field">
        <label htmlFor="patched-dir">Patched ROM folder</label>
        <div className="ctl">
          <input id="patched-dir" readOnly value={usage?.patchedRomDir ?? ''} />
          <button className="btn" onClick={() => void window.api.storage.openFolder()}>
            Open folder
          </button>
        </div>
        <p className="hint">
          {usage
            ? `${usage.fileCount} patched ROM${usage.fileCount === 1 ? '' : 's'} · ${formatBytes(usage.totalBytes)}`
            : 'Measuring…'}
        </p>
      </div>

      <p className="hint">
        Patched ROMs can be rebuilt from your base ROM at any time — removing a mod from the library
        frees the space again.
      </p>
    </>
  )
}

export default StoragePane
