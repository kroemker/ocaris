import type { ModRecord } from '../db/mods'
import { mapWithConcurrency } from './concurrency'
import { CatalogFetchError, type ModCatalogSource } from './types'

/**
 * hylianmodding.com/mods is a Vite SPA with no bespoke backend API - it
 * fetches static, same-origin JSON files. See docs/catalog-source-spec.md
 * for how this was found and the format quirks below.
 */

interface HylianModIndex {
  mods: string[]
}

interface HylianModDetail {
  id: string
  name: string
  authors?: string[]
  description?: string
  category?: string
  supported_games?: string
  completion_status?: string
  thumbnail_image?: string
  screenshots?: string[]
  download_link?: string
  last_updated?: string
}

const DEFAULT_BASE_URL = 'https://hylianmodding.com'
const DETAIL_FETCH_CONCURRENCY = 5

function resolveUrl(baseUrl: string, link: string): string {
  if (/^https?:\/\//i.test(link)) return link
  return new URL(link.startsWith('/') ? link : `/${link}`, baseUrl).toString()
}

export class HylianModdingCatalogSource implements ModCatalogSource {
  readonly id = 'hylianmodding'

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async fetchCatalog(): Promise<ModRecord[]> {
    const index = await this.fetchJson<HylianModIndex>('/mods/index.json')

    const details = await mapWithConcurrency(index.mods, DETAIL_FETCH_CONCURRENCY, (modId) =>
      this.fetchModDetail(modId)
    )

    return details
      .filter((detail): detail is HylianModDetail => detail !== null)
      .filter((detail) => (detail.supported_games ?? '').toUpperCase() === 'OOT')
      .map((detail) => this.toModRecord(detail))
  }

  /** One bad entry shouldn't fail the whole catalog refresh. */
  private async fetchModDetail(modId: string): Promise<HylianModDetail | null> {
    try {
      return await this.fetchJson<HylianModDetail>(`/mods/${encodeURIComponent(modId)}/mod.json`)
    } catch {
      return null
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`)
    } catch (err) {
      throw new CatalogFetchError(`Failed to reach ${path}: ${(err as Error).message}`)
    }
    if (!response.ok) {
      throw new CatalogFetchError(`${path}: HTTP ${response.status}`)
    }
    try {
      return (await response.json()) as T
    } catch (err) {
      throw new CatalogFetchError(`${path}: invalid JSON (${(err as Error).message})`)
    }
  }

  private toModRecord(detail: HylianModDetail): ModRecord {
    return {
      source: this.id,
      sourceId: detail.id,
      name: detail.name,
      author: detail.authors && detail.authors.length > 0 ? detail.authors.join(', ') : null,
      description: detail.description ?? null,
      metadata: {
        downloadLink: detail.download_link ? resolveUrl(this.baseUrl, detail.download_link) : null,
        thumbnailUrl: detail.thumbnail_image
          ? resolveUrl(this.baseUrl, detail.thumbnail_image)
          : null,
        completionStatus: detail.completion_status ?? null,
        lastUpdated: detail.last_updated ?? null
      }
    }
  }
}
