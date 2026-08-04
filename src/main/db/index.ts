import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let db: Database.Database | undefined

export function getDbPath(): string {
  return join(app.getPath('userData'), 'ocaris.db')
}

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}
