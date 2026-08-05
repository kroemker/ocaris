import type { ModRecord } from '../db/mods'
import { classifyDownloadLink } from '../mods/resolvePatch'
import { CatalogFetchError, type ModCatalogSource } from './types'
import { extractDescription, parseTemplateParams } from './wikitext'

/**
 * zelda-64-mods.fandom.com is a MediaWiki, so there's a real read API rather
 * than anything scraped: every mod is an article in Category:Ocarina of Time
 * Mods carrying a flat {{Infobox_mod}}. See docs/catalog-source-spec.md.
 *
 * It's broader than hylianmodding.com (132 OoT mods against 41) but much
 * looser: two thirds of its download links point at a MediaFire/Drive/Discord
 * landing page rather than a patch file, so most entries are browse-only.
 */

const DEFAULT_BASE_URL = 'https://zelda-64-mods.fandom.com'
const CATEGORY = 'Category:Ocarina of Time Mods'

/** MediaWiki caps an anonymous multi-value query at 50 titles. */
const TITLES_PER_REQUEST = 50

/** Wiki etiquette: identify the client rather than turning up as a bare
 *  Chrome UA, so the operators can see who's making the calls. */
const USER_AGENT = 'Ocaris (+https://github.com/kroemker/ocaris)'

interface WikiPage {
  pageid: number
  title: string
  missing?: boolean
  revisions?: { slots: { main: { content: string } } }[]
  imageinfo?: { thumburl?: string; url?: string }[]
}

interface WikiResponse {
  query?: { pages?: WikiPage[] }
  continue?: Record<string, string>
  error?: { code: string; info: string }
}

/** The infobox fields this source reads. Everything else on the page (plot,
 *  galleries, changelogs) is prose for humans. */
interface ModInfobox {
  creator?: string
  status?: string
  year?: string
  image1?: string
  download?: string
  alternative_download?: string
  '3rd_download_link'?: string
}

const DOWNLOAD_FIELDS = ['download', 'alternative_download', '3rd_download_link'] as const

/**
 * Pages list up to three download links with no indication of which is a file
 * and which is a landing page, so the one the installer can actually act on
 * wins. When none is installable the first link is still worth keeping - the
 * row uses it to send the user to the download page by hand.
 */
function pickDownloadLink(infobox: ModInfobox): string | null {
  const links = DOWNLOAD_FIELDS.map((field) => infobox[field])
    .filter((link): link is string => typeof link === 'string' && /^https?:\/\//i.test(link.trim()))
    .map((link) => link.trim())

  return links.find((link) => classifyDownloadLink(link) !== 'unsupported') ?? links[0] ?? null
}

export class ZeldaFandomCatalogSource implements ModCatalogSource {
  readonly id = 'zeldafandom'

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async fetchCatalog(): Promise<ModRecord[]> {
    const pages = await this.fetchCategoryPages()

    const parsed = pages.flatMap((page) => {
      const wikitext = page.revisions?.[0]?.slots?.main?.content
      if (!wikitext) return []
      const infobox = parseTemplateParams(wikitext, 'Infobox_mod') as ModInfobox | null
      // A page without the infobox is a stub or a list article, not a mod.
      if (!infobox) return []
      return [{ page, infobox, wikitext }]
    })

    const thumbnails = await this.fetchThumbnails(
      parsed.map(({ infobox }) => infobox.image1).filter((name): name is string => !!name)
    )

    return parsed.map(({ page, infobox, wikitext }) =>
      this.toModRecord(page, infobox, wikitext, thumbnails)
    )
  }

  /** Every article in the OoT category, with its wikitext, following the
   *  API's continuation until the category is exhausted. */
  private async fetchCategoryPages(): Promise<WikiPage[]> {
    const pages: WikiPage[] = []
    let cont: Record<string, string> = {}

    do {
      const response = await this.query({
        generator: 'categorymembers',
        gcmtitle: CATEGORY,
        gcmnamespace: '0',
        gcmlimit: String(TITLES_PER_REQUEST),
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        ...cont
      })
      pages.push(...(response.query?.pages ?? []))
      cont = response.continue ?? {}
    } while (Object.keys(cont).length > 0)

    if (pages.length === 0) {
      throw new CatalogFetchError(`${CATEGORY} came back empty`)
    }
    return pages
  }

  /**
   * Resolves `image1=Some File.png` to a URL. The wiki renders thumbnails
   * server-side, so asking for a 312px-wide one saves downloading full-size
   * artwork the row would only shrink again.
   */
  private async fetchThumbnails(fileNames: readonly string[]): Promise<Map<string, string>> {
    const titles = [...new Set(fileNames.map((name) => `File:${name.replace(/^File:/i, '')}`))]
    const resolved = new Map<string, string>()

    for (let i = 0; i < titles.length; i += TITLES_PER_REQUEST) {
      const batch = titles.slice(i, i + TITLES_PER_REQUEST)
      const response = await this.query({
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: '312',
        titles: batch.join('|')
      })

      for (const page of response.query?.pages ?? []) {
        const url = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url
        // A red link (the page names an image nobody uploaded) is common here
        // and just means no thumbnail.
        if (url) resolved.set(page.title.toLowerCase(), url)
      }
    }

    return resolved
  }

  private async query(params: Record<string, string>): Promise<WikiResponse> {
    const search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      ...params
    })
    const url = `${this.baseUrl}/api.php?${search}`

    let response: Response
    try {
      response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
    } catch (err) {
      throw new CatalogFetchError(`Failed to reach the wiki API: ${(err as Error).message}`)
    }
    if (!response.ok) {
      throw new CatalogFetchError(`Wiki API: HTTP ${response.status}`)
    }

    let body: WikiResponse
    try {
      body = (await response.json()) as WikiResponse
    } catch (err) {
      throw new CatalogFetchError(`Wiki API: invalid JSON (${(err as Error).message})`)
    }
    // MediaWiki reports its own failures with a 200 and an error object.
    if (body.error) {
      throw new CatalogFetchError(`Wiki API: ${body.error.code} - ${body.error.info}`)
    }
    return body
  }

  private pageUrl(title: string): string {
    return `${this.baseUrl}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  }

  private toModRecord(
    page: WikiPage,
    infobox: ModInfobox,
    wikitext: string,
    thumbnails: Map<string, string>
  ): ModRecord {
    const image = infobox.image1 ? `File:${infobox.image1.replace(/^File:/i, '')}` : null

    return {
      source: this.id,
      // The page id rather than the title: it survives a rename, so a mod the
      // user has already installed doesn't turn into a second, empty row.
      sourceId: String(page.pageid),
      name: page.title,
      author: infobox.creator?.trim() || null,
      description: extractDescription(wikitext),
      metadata: {
        downloadLink: pickDownloadLink(infobox),
        thumbnailUrl: image ? (thumbnails.get(image.toLowerCase()) ?? null) : null,
        completionStatus: infobox.status?.trim() || null,
        pageUrl: this.pageUrl(page.title),
        // `year` is the release date, not a last-modified stamp - the two
        // aren't interchangeable, so it doesn't fill lastUpdated.
        lastUpdated: null,
        releaseYear: infobox.year?.trim() || null
      }
    }
  }
}
