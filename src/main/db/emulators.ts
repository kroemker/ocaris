import type Database from 'better-sqlite3'

export interface Emulator {
  id: number
  name: string
  executablePath: string
  argsTemplate: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

interface EmulatorRow {
  id: number
  name: string
  executable_path: string
  args_template: string
  is_default: number
  created_at: number
  updated_at: number
}

function rowToEmulator(row: EmulatorRow): Emulator {
  return {
    id: row.id,
    name: row.name,
    executablePath: row.executable_path,
    argsTemplate: row.args_template,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listEmulators(db: Database.Database): Emulator[] {
  const rows = db
    .prepare('SELECT * FROM emulators ORDER BY is_default DESC, name COLLATE NOCASE')
    .all() as EmulatorRow[]
  return rows.map(rowToEmulator)
}

export interface AddEmulatorInput {
  name: string
  executablePath: string
  argsTemplate: string
}

export function addEmulator(db: Database.Database, input: AddEmulatorInput): Emulator {
  const now = Date.now()
  const existingCount = (
    db.prepare('SELECT COUNT(*) as count FROM emulators').get() as { count: number }
  ).count
  const isDefault = existingCount === 0

  const result = db
    .prepare(
      `INSERT INTO emulators (name, executable_path, args_template, is_default, created_at, updated_at)
       VALUES (@name, @executablePath, @argsTemplate, @isDefault, @createdAt, @updatedAt)`
    )
    .run({
      name: input.name,
      executablePath: input.executablePath,
      argsTemplate: input.argsTemplate,
      isDefault: isDefault ? 1 : 0,
      createdAt: now,
      updatedAt: now
    })

  return getEmulator(db, Number(result.lastInsertRowid))
}

export interface UpdateEmulatorInput {
  name: string
  executablePath: string
  argsTemplate: string
}

export function updateEmulator(
  db: Database.Database,
  id: number,
  input: UpdateEmulatorInput
): Emulator {
  db.prepare(
    `UPDATE emulators SET name = @name, executable_path = @executablePath,
       args_template = @argsTemplate, updated_at = @updatedAt WHERE id = @id`
  ).run({
    id,
    name: input.name,
    executablePath: input.executablePath,
    argsTemplate: input.argsTemplate,
    updatedAt: Date.now()
  })

  return getEmulator(db, id)
}

export function deleteEmulator(db: Database.Database, id: number): void {
  const deleteTx = db.transaction((emulatorId: number) => {
    const deleted = db.prepare('SELECT is_default FROM emulators WHERE id = ?').get(emulatorId) as
      { is_default: number } | undefined

    db.prepare('DELETE FROM emulators WHERE id = ?').run(emulatorId)

    if (deleted?.is_default === 1) {
      const next = db.prepare('SELECT id FROM emulators ORDER BY id LIMIT 1').get() as
        { id: number } | undefined
      if (next) {
        db.prepare('UPDATE emulators SET is_default = 1 WHERE id = ?').run(next.id)
      }
    }
  })

  deleteTx(id)
}

export function setDefaultEmulator(db: Database.Database, id: number): void {
  const setDefaultTx = db.transaction((emulatorId: number) => {
    db.prepare('UPDATE emulators SET is_default = 0').run()
    db.prepare('UPDATE emulators SET is_default = 1 WHERE id = ?').run(emulatorId)
  })

  setDefaultTx(id)
}

function getEmulator(db: Database.Database, id: number): Emulator {
  const row = db.prepare('SELECT * FROM emulators WHERE id = ?').get(id) as EmulatorRow | undefined
  if (!row) {
    throw new Error(`Emulator ${id} not found`)
  }
  return rowToEmulator(row)
}
