import { useEffect, useState } from 'react'
import type { Emulator, EmulatorInput, EmulatorValidationError } from '@shared/ipc'

const EMPTY_FORM: EmulatorInput = { name: '', executablePath: '', argsTemplate: '{romPath}' }

function EmulatorSetup(): React.JSX.Element {
  const [emulators, setEmulators] = useState<Emulator[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EmulatorInput>(EMPTY_FORM)
  const [errors, setErrors] = useState<EmulatorValidationError[]>([])
  const [busy, setBusy] = useState(false)

  function refresh(): Promise<void> {
    return window.api.emulator.list().then(setEmulators)
  }

  useEffect(() => {
    void refresh()
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
    <section>
      <h2>Emulators</h2>

      {emulators.length === 0 ? (
        <p>No emulators configured yet.</p>
      ) : (
        <ul>
          {emulators.map((emulator) => (
            <li key={emulator.id}>
              <strong>{emulator.name}</strong> {emulator.isDefault && '(default)'}
              <br />
              <code>{emulator.executablePath}</code> <code>{emulator.argsTemplate}</code>
              <br />
              <button onClick={() => startEdit(emulator)} disabled={busy}>
                Edit
              </button>
              {!emulator.isDefault && (
                <button onClick={() => void handleSetDefault(emulator.id)} disabled={busy}>
                  Set as default
                </button>
              )}
              <button onClick={() => void handleDelete(emulator.id)} disabled={busy}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <h3>{editingId === null ? 'Add emulator' : 'Edit emulator'}</h3>

        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        {errorFor('name') && <p role="alert">{errorFor('name')}</p>}

        <label>
          Executable path
          <input
            value={form.executablePath}
            onChange={(e) => setForm((f) => ({ ...f, executablePath: e.target.value }))}
          />
        </label>
        <button type="button" onClick={() => void handleBrowse()} disabled={busy}>
          Browse…
        </button>
        {errorFor('executablePath') && <p role="alert">{errorFor('executablePath')}</p>}

        <label>
          Launch arguments
          <input
            value={form.argsTemplate}
            onChange={(e) => setForm((f) => ({ ...f, argsTemplate: e.target.value }))}
          />
        </label>
        {errorFor('argsTemplate') && <p role="alert">{errorFor('argsTemplate')}</p>}

        <button type="submit" disabled={busy}>
          {editingId === null ? 'Add' : 'Save'}
        </button>
        {editingId !== null && (
          <button type="button" onClick={resetForm} disabled={busy}>
            Cancel
          </button>
        )}
      </form>
    </section>
  )
}

export default EmulatorSetup
