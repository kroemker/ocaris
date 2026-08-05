import type Database from 'better-sqlite3'

export interface Migration {
  id: number
  name: string
  up: (db: Database.Database) => void
}

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
  },
  {
    id: 4,
    name: 'mods',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mods (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          source_id TEXT NOT NULL,
          name TEXT NOT NULL,
          author TEXT,
          description TEXT,
          metadata_json TEXT,
          fetched_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mods_source ON mods (source);

        CREATE TABLE IF NOT EXISTS mod_status (
          mod_id TEXT PRIMARY KEY REFERENCES mods (id) ON DELETE CASCADE,
          state TEXT NOT NULL DEFAULT 'not_downloaded',
          patch_file_path TEXT,
          patched_rom_path TEXT,
          download_progress_bytes INTEGER,
          download_total_bytes INTEGER,
          error_message TEXT,
          updated_at INTEGER NOT NULL
        );
      `)
    }
  },
  {
    id: 5,
    name: 'app_config_theme',
    up: (db) => {
      db.exec(`ALTER TABLE app_config ADD COLUMN theme TEXT NOT NULL DEFAULT 'system';`)
    }
  },
  {
    id: 6,
    name: 'mods_first_seen_at',
    up: (db) => {
      // fetched_at is rewritten on every catalog refresh, so it can't answer
      // "when did this mod first appear". first_seen_at is set on insert and
      // never updated; existing rows are backfilled with what we do know.
      db.exec(`
        ALTER TABLE mods ADD COLUMN first_seen_at INTEGER;
        UPDATE mods SET first_seen_at = fetched_at WHERE first_seen_at IS NULL;
      `)
    }
  }
]

/**
 * Applies every migration the database hasn't seen yet.
 *
 * `upToId` stops after that migration, which lets tests reproduce an older
 * schema and then migrate onto it - the only way to check that a backfill
 * actually backfills.
 */
export function runMigrations(db: Database.Database, upToId = Number.POSITIVE_INFINITY): void {
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

  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (migration.id > upToId) break
    if (!appliedIds.has(migration.id)) {
      applyMigration(migration)
    }
  }
}
