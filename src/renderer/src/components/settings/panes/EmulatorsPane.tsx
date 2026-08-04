import { useEffect, useState } from 'react'
import type { Emulator, EmulatorInput, EmulatorValidationError } from '@shared/ipc'

const EMPTY_FORM: EmulatorInput = { name: '', executablePath: '', argsTemplate: '{romPath}' }

interface EmulatorsPaneProps {
  onChange?: (emulators: Emulator[]) => void
}

function EmulatorsPane({ onChange }: EmulatorsPaneProps): React.JSX.Element {
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EmulatorInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<EmulatorValidationError[]>([])
  const [busy, setBusy] = useState(false)

  function refresh(): Promise<void> {
    return window.api.emulator.list().then((list) => {
      setEmulators(list)
      onChange?.(list)
    })
  }

  useEffect(() => {
    void refresh()
    // onChange intentionally omitted: this should only run once on mount,
    // not whenever the parent passes a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function errorFor(field: EmulatorValidationError['field']): string | undefined {
    return errors.find((e) => e.field === field)?.message
  }

  async function handleBrowse(): Promise<void> {
    const path = await window.api.emulator.selectExecutable()
    if (path) setForm((f) => ({ ...f, executablePath: path }))
  }

  function startEdit(emulator: Emulator): void {
    setEditingId(emulator.id)
    setForm({
      name: emulator.name,
      executablePath: emulator.executablePath,
      argsTemplate: emulator.argsTemplate
    })
    setErrors([])
  }

  function resetForm(): void {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors([])
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    try {
      const result =
        editingId === null
          ? await window.api.emulator.add(form)
          : await window.api.emulator.update(editingId, form)

      if (result.errors.length > 0) {
        setErrors(result.errors)
        return
      }

      resetForm()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setBusy(true)
    try {
      await window.api.emulator.remove(id)
      if (editingId === id) resetForm()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleSetDefault(id: number): Promise<void> {
    setBusy(true)
    try {
      await window.api.emulator.setDefault(id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3 className="sec-title">Emulators</h3>

      {emulators.length === 0 ? (
        <p className="hint">No emulators configured yet.</p>
      ) : (
        emulators.map((emulator) => (
          <div className="emu-row" key={emulator.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {emulator.name} {emulator.isDefault && <span className="pill flat">default</span>}
              </div>
              <div className="path clip">{emulator.executablePath}</div>
            </div>
            <button className="btn sm" onClick={() => startEdit(emulator)} disabled={busy}>
              Edit
            </button>
            {!emulator.isDefault && (
              <button
                className="btn sm ghost"
                onClick={() => void handleSetDefault(emulator.id)}
                disabled={busy}
              >
                Make default
              </button>
            )}
            <button
              className="btn sm ghost danger"
              onClick={() => void handleDelete(emulator.id)}
              disabled={busy}
            >
              Remove
            </button>
          </div>
        ))
      )}

      <form onSubmit={(e) => void handleSubmit(e)} style={{ marginTop: 18 }}>
        <h3 className="sec-title">{editingId === null ? 'Add emulator' : 'Edit emulator'}</h3>

        <div className="field">
          <label htmlFor="emu-name">Name</label>
          <div className="ctl">
            <input
              id="emu-name"
              value={form.name}
              className={errorFor('name') ? 'invalid' : undefined}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          {errorFor('name') && <p className="hint err">{errorFor('name')}</p>}
        </div>

        <div className="field">
          <label htmlFor="emu-path">Executable</label>
          <div className="ctl">
            <input
              id="emu-path"
              value={form.executablePath}
              className={errorFor('executablePath') ? 'invalid' : undefined}
              onChange={(e) => setForm((f) => ({ ...f, executablePath: e.target.value }))}
            />
            <button
              className="btn"
              type="button"
              onClick={() => void handleBrowse()}
              disabled={busy}
            >
              Browse…
            </button>
          </div>
          {errorFor('executablePath') && <p className="hint err">{errorFor('executablePath')}</p>}
        </div>

        <div className="field">
          <label htmlFor="emu-args">Launch arguments</label>
          <div className="ctl">
            <input
              id="emu-args"
              value={form.argsTemplate}
              className={errorFor('argsTemplate') ? 'invalid' : undefined}
              onChange={(e) => setForm((f) => ({ ...f, argsTemplate: e.target.value }))}
            />
          </div>
          {errorFor('argsTemplate') ? (
            <p className="hint err">{errorFor('argsTemplate')}</p>
          ) : (
            <p className="hint">
              <code>{'{romPath}'}</code> is replaced with the patched ROM&apos;s path.
            </p>
          )}
        </div>

        <div className="ctl">
          <button className="btn primary" type="submit" disabled={busy}>
            {editingId === null ? 'Add emulator' : 'Save changes'}
          </button>
          {editingId !== null && (
            <button className="btn ghost" type="button" onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  )
}

export default EmulatorsPane
