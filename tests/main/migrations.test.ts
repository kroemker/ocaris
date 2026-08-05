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
      { id: 7, name: 'app_config_storage_root' }
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
    expect(count.count).toBe(7)

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
