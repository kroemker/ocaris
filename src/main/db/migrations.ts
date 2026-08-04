import type Database from 'better-sqlite3'

export interface Migration {
  id: number
  name: string
  up: (db: Database.Database) => void
}

/**
 * WP0 only proves the migration mechanism works; the real application
 * schema (mods, mod_status, emulators, app_config) lands in WP4.
 */
const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema_version_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        );
      `)
    }
  },
  {
    id: 2,
    name: 'app_config',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          rom_path TEXT,
          rom_variant TEXT,
          rom_verified INTEGER NOT NULL DEFAULT 0,
          rom_user_confirmed INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER
        );
      `)
    }
  },
  {
    id: 3,
    name: 'emulators',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS emulators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          executable_path TEXT NOT NULL,
          args_template TEXT NOT NULL DEFAULT '{romPath}',
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)
    }
  }
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  const appliedIds = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: number }).id)
  )

  const applyMigration = db.transaction((migration: Migration) => {
    migration.up(db)
    db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
      migration.id,
      migration.name,
      Date.now()
    )
  })

  for (const migration of migrations.sort((a, b) => a.id - b.id)) {
    if (!appliedIds.has(migration.id)) {
      applyMigration(migration)
    }
  }
}
