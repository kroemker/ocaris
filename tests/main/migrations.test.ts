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
      { id: 2, name: 'app_config' }
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
    expect(count.count).toBe(2)

    db.close()
  })
})
