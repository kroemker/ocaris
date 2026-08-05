import type { ModRecord } from '../db/mods'

/**
 * Pluggable interface so the backing catalog source (currently
 * hylianmodding.com) can be swapped without touching the rest of the app -
 * see docs/catalog-source-spec.md for why this needs to stay replaceable.
 */
export interface ModCatalogSource {
  readonly id: string
  fetchCatalog(): Promise<ModRecord[]>
}

/** One catalog a mod row was built from, for the UI to link back to. */
export interface ModSourceRef {
  source: string
  sourceId: string
  pageUrl: string | null
}

/**
 * The `metadata` blob every source writes and the IPC layer reads back. It's
 * stored as free-form JSON, so this type is a convention rather than something
 * the database enforces - treat every field as possibly absent on rows written
 * by an older version.
 */
export interface CatalogMetadata {
  downloadLink: string | null
  thumbnailUrl: string | null
  completionStatus: string | null
  /** Human-facing page for the mod, for "Open page" - not a file to download. */
  pageUrl: string | null
  lastUpdated: string | null
  /** Present on merged rows: every catalog that contributed, best first. */
  sources?: ModSourceRef[]
}

export class CatalogFetchError extends Error {}
