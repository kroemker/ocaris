import { useEffect, useState } from 'react'

function AboutPane(): React.JSX.Element {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    void window.api.config.get().then((settings) => setVersion(settings.appVersion))
  }, [])

  return (
    <>
      <h3 className="sec-title">About</h3>
      <p style={{ marginTop: 0 }}>
        Ocaris {version ?? '…'} — local desktop hub for Ocarina of Time mods.
      </p>
      <p className="hint">Electron · better-sqlite3 · BPS patch engine</p>
    </>
  )
}

export default AboutPane
