import type Database from 'better-sqlite3'
import { upsertMods, type ModRecord } from '../db/mods'
import { mergeCatalogs } from './merge'
import type { ModCatalogSource } from './types'

export interface CatalogSourceResult {
  source: string
  /** Mods this source contributed, before merging. Null when it failed. */
  count: number | null
  errorMessage: string | null
}

export interface CatalogRefreshResult {
  /** Rows written after merging - lower than the sum of the per-source counts
   *  wherever two catalogs describe the same mod. */
  count: number
  refreshedAt: number
  sources: CatalogSourceResult[]
}

/**
 * Fetches every source, merges them into one row per mod and writes the
 * result. `sources` is in priority order (see mergeCatalogs).
 *
 * A source that fails is reported and skipped rather than aborting the
 * refresh: one catalog being down shouldn't cost the user the other one. All
 * of them failing does throw - that's not a partial result, it's a refresh
 * that didn't happen.
 */
export async function refreshCatalog(
  db: Database.Database,
  sources: readonly ModCatalogSource[]
): Promise<CatalogRefreshResult> {
  const settled = await Promise.all(
    sources.map(
      async (
        source
      ): Promise<{ source: string; records: ModRecord[] | null; errorMessage: string | null }> => {
        try {
          return { source: source.id, records: await source.fetchCatalog(), errorMessage: null }
        } catch (err) {
          return {
            source: source.id,
            records: null,
            errorMessage: err instanceof Error ? err.message : String(err)
          }
        }
      }
    )
  )

  const succeeded = settled.filter((entry) => entry.records !== null)
  if (succeeded.length === 0) {
    throw new Error(
      `Every catalog source failed: ${settled.map((entry) => `${entry.source} (${entry.errorMessage})`).join('; ')}`
    )
  }

  const merged = mergeCatalogs(succeeded.map((entry) => entry.records as ModRecord[]))
  upsertMods(db, merged)

  return {
    count: merged.length,
    refreshedAt: Date.now(),
    sources: settled.map((entry) => ({
      source: entry.source,
      count: entry.records?.length ?? null,
      errorMessage: entry.errorMessage
    }))
  }
}
