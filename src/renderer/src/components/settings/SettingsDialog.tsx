import { useEffect, useRef, useState } from 'react'
import AppearancePane from './panes/AppearancePane'
import RomPane from './panes/RomPane'
import EmulatorsPane from './panes/EmulatorsPane'
import CatalogPane from './panes/CatalogPane'
import StoragePane from './panes/StoragePane'
import AboutPane from './panes/AboutPane'
import type { Emulator, RomConfig, SettingsPane } from '@shared/ipc'

// Defined in the shared IPC contract because main validates it before storing
// the last-opened pane, but re-exported here, where it reads as this
// component's own type.
export type { SettingsPane }

const PANES: ReadonlyArray<{ id: SettingsPane; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'rom', label: 'ROM' },
  { id: 'emulators', label: 'Emulators' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'storage', label: 'Storage' },
  { id: 'about', label: 'About' }
]

interface SettingsDialogProps {
  open: boolean
  /** Pane to show when the dialog is opened. */
  initialPane?: SettingsPane
  /** Fires only when the user picks a section, so that opening the dialog on a
   *  specific pane programmatically doesn't overwrite their last choice. */
  onPaneChange?: (pane: SettingsPane) => void
  onClose: () => void
  onRomConfigChange?: (config: RomConfig) => void
  onEmulatorsChange?: (emulators: Emulator[]) => void
  onCatalogRefreshed?: () => void
}

function SettingsDialog({
  open,
  initialPane = 'appearance',
  onPaneChange,
  onClose,
  onRomConfigChange,
  onEmulatorsChange,
  onCatalogRefreshed
}: SettingsDialogProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [pane, setPane] = useState<SettingsPane>(initialPane)

  // <dialog>.showModal() brings Esc, the backdrop, a focus trap and focus
  // restore with it, so none of that is reimplemented here.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setPane(initialPane)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, initialPane])

  return (
    <dialog
      className="settings"
      ref={ref}
      aria-label="Settings"
      // Fires for Esc as well as an explicit close(), so it's the one place
      // that has to tell the parent the dialog is no longer open.
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="settings-inner">
        <div className="modal-h">
          <h2>Settings</h2>
          <div className="spacer" />
          <button className="btn icon ghost" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="msplit">
          <nav className="mside" aria-label="Settings sections">
            {PANES.map((entry) => (
              <button
                key={entry.id}
                className={entry.id === pane ? 'on' : undefined}
                aria-current={entry.id === pane}
                onClick={() => {
                  setPane(entry.id)
                  onPaneChange?.(entry.id)
                }}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="modal-b">
            {pane === 'appearance' && <AppearancePane />}
            {pane === 'rom' && <RomPane onConfigChange={onRomConfigChange} />}
            {pane === 'emulators' && <EmulatorsPane onChange={onEmulatorsChange} />}
            {pane === 'catalog' && <CatalogPane onRefreshed={onCatalogRefreshed} />}
            {pane === 'storage' && <StoragePane />}
            {pane === 'about' && <AboutPane />}
          </div>
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default SettingsDialog
