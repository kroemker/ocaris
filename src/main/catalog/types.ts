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

export class CatalogFetchError extends Error {}
