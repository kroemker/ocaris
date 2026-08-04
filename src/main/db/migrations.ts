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
