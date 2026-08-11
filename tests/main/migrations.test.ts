import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/db/migrations'

describe('runMigrations', () => {
  it('creates the schema_migrations table and records applied migrations', () => {
    const db = new Database(':memory:')

    runMigrations(db)

    const rows = db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all()
    expect(rows).toEqual([
      { id: 1, name: 'initial_schema_version_table' },
      { id: 2, name: 'app_config' },
      { id: 3, name: 'emulators' },
      { id: 4, name: 'mods' },
      { id: 5, name: 'app_config_theme' },
      { id: 6, name: 'mods_first_seen_at' },
      { id: 7, name: 'app_config_storage_root' },
      { id: 8, name: 'emulators_known_id' },
      { id: 9, name: 'app_config_ui_state' },
      { id: 10, name: 'mod_prefs' }
    ])

    db.close()
  })

  it('is idempotent when run multiple times against the same database', () => {
    const db = new Database(':memory:')

    runMigrations(db)
    runMigrations(db)

    const count = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as {
      count: number
    }
    expect(count.count).toBe(10)

    db.close()
  })

  it('gives app_config a theme column defaulting to system', () => {
    const db = new Database(':memory:')
    runMigrations(db)

    db.prepare('INSERT INTO app_config (id, rom_path) VALUES (1, ?)').run('/roms/oot.z64')
    const row = db.prepare('SELECT theme FROM app_config WHERE id = 1').get() as { theme: string }

    expect(row.theme).toBe('system')

    db.close()
  })

  it('gives app_config a storage_root column defaulting to null', () => {
    const db = new Database(':memory:')
    runMigrations(db)

    db.prepare('INSERT INTO app_config (id, rom_path) VALUES (1, ?)').run('/roms/oot.z64')
    const row = db.prepare('SELECT storage_root FROM app_config WHERE id = 1').get() as {
      storage_root: string | null
    }

    expect(row.storage_root).toBeNull()

    db.close()
  })

  it('adds the ui state and window bounds columns to an existing app_config row', () => {
    const db = new Database(':memory:')

    // Migrate to just before the columns existed and write a row the old
    // schema would have produced, so this covers an upgrade, not a fresh
    // install.
    runMigrations(db, 8)
    db.prepare('INSERT INTO app_config (id, rom_path) VALUES (1, ?)').run('/roms/oot.z64')

    runMigrations(db)

    const row = db
      .prepare('SELECT rom_path, ui_state_json, window_bounds_json FROM app_config WHERE id = 1')
      .get() as {
      rom_path: string
      ui_state_json: string | null
      window_bounds_json: string | null
    }

    expect(row.rom_path).toBe('/roms/oot.z64')
    expect(row.ui_state_json).toBeNull()
    expect(row.window_bounds_json).toBeNull()

    db.close()
  })

  it('clears a mod_prefs emulator when that emulator is deleted', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    db.prepare(
      `INSERT INTO mods (id, source, source_id, name, fetched_at) VALUES (?, ?, ?, ?, ?)`
    ).run('src:1', 'src', '1', 'A mod', 1234)
    db.prepare(
      `INSERT INTO emulators (id, name, executable_path, created_at, updated_at)
       VALUES (1, 'Ares', '/usr/bin/ares', 0, 0)`
    ).run()
    db.prepare(
      `INSERT INTO mod_prefs (mod_id, favorite, hidden, emulator_id, updated_at)
       VALUES ('src:1', 1, 0, 1, 0)`
    ).run()

    db.prepare('DELETE FROM emulators WHERE id = 1').run()

    // The row survives - the favourite is still a favourite - and only the
    // reference to the emulator that no longer exists is dropped.
    const row = db
      .prepare('SELECT favorite, emulator_id FROM mod_prefs WHERE mod_id = ?')
      .get('src:1') as { favorite: number; emulator_id: number | null }
    expect(row).toEqual({ favorite: 1, emulator_id: null })

    db.close()
  })

  it('backfills first_seen_at on existing mods', () => {
    const db = new Database(':memory:')

    // Migrate up to the point before first_seen_at existed, insert a row the
    // way the old schema would have, then finish migrating.
    runMigrations(db, 4)
    db.prepare(
      `INSERT INTO mods (id, source, source_id, name, fetched_at) VALUES (?, ?, ?, ?, ?)`
    ).run('src:1', 'src', '1', 'Old mod', 1234)

    runMigrations(db)

    const row = db.prepare('SELECT first_seen_at FROM mods WHERE id = ?').get('src:1') as {
      first_seen_at: number
    }
    expect(row.first_seen_at).toBe(1234)

    db.close()
  })
})
