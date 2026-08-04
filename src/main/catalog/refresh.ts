import type Database from 'better-sqlite3'
import { upsertMods } from '../db/mods'
import type { ModCatalogSource } from './types'

export interface CatalogRefreshResult {
  source: string
  count: number
  refreshedAt: number
}

export async function refreshCatalog(
  db: Database.Database,
  source: ModCatalogSource
): Promise<CatalogRefreshResult> {
  const records = await source.fetchCatalog()
  upsertMods(db, records)
  return { source: source.id, count: records.length, refreshedAt: Date.now() }
}
