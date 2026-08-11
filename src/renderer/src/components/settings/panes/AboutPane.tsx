import { useEffect, useState } from 'react'
import { updateView, type UpdateActionId } from '../../../lib/update'
import { useUpdateStatus } from '../../../lib/useUpdateStatus'

function AboutPane(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)
  const update = useUpdateStatus()

  useEffect(() => {
    void window.api.config.get().then((settings) => setVersion(settings.appVersion))
  }, [])

  const view = updateView(update.status, version)

  function run(action: UpdateActionId): void {
    if (action === 'check') update.check()
    else if (action === 'download') update.download()
    else update.install()
  }

  return (
    <>
      <h3 className="sec-title">About</h3>
      <p style={{ marginTop: 0 }}>
        Ocaris {version ?? '…'} — local desktop hub for Ocarina of Time mods.
      </p>
      <p className="hint">Electron · better-sqlite3 · BPS patch engine</p>

      <h3 className="sec-title" style={{ marginTop: 24 }}>
        Updates
      </h3>
      <div className="update-box">
        <div className="update-head">{view.headline}</div>
        {view.detail && <p className="update-detail">{view.detail}</p>}

        {view.showProgress && (
          <div className="prog">
            <div className="bar">
              <i style={{ width: `${update.status.percent ?? 0}%` }} />
            </div>
          </div>
        )}

        {view.action && (
          <button
            className={view.action.primary ? 'btn primary' : 'btn'}
            disabled={view.busy}
            onClick={() => run(view.action!.id)}
          >
            {view.action.label}
          </button>
        )}
      </div>
    </>
  )
}

export default AboutPane
