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

  useEffect(() => {
    void window.api.storage.usage().then(setUsage)
  }, [])

  return (
    <>
      <h3 className="sec-title">Storage</h3>

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
