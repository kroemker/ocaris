import { createServer, type RequestListener, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { ZeldaFandomCatalogSource } from '../../../src/main/catalog/zeldaFandomSource'
import { CatalogFetchError } from '../../../src/main/catalog/types'

// Response shapes are those of the live MediaWiki API (formatversion=2) as
// captured from zelda-64-mods.fandom.com; see docs/catalog-source-spec.md.

function page(pageid: number, title: string, infobox: string, body = ''): unknown {
  return {
    pageid,
    title,
    revisions: [{ slots: { main: { content: `{{Infobox_mod|${infobox}}}\n${body}` } } }]
  }
}

const FIRST_BATCH = {
  batchcomplete: true,
  continue: { gcmcontinue: 'page|02|172', continue: 'gcmcontinue||' },
  query: {
    pages: [
      page(
        172,
        'The Missing Link',
        'image1=The Missing Link.jpg|creator=Kaze, Zel|status=Complete|' +
          'download=https://www.romhacking.net/hacks/5334/|' +
          'alternative_download=https://hylianmodding.com/mods/the_missing_link/downloads/tml.bps',
        "==Description==\n''A mini-adventure set between Ocarina of Time and Majora's Mask, long enough to survive the italic-blurb threshold.''"
      )
    ]
  }
}

const SECOND_BATCH = {
  batchcomplete: true,
  query: {
    pages: [
      page(
        200,
        'Burger Quest',
        'creator=Chef|status=Demo|image1=Missing Image.png|' +
          'download=https://www.mediafire.com/file/abc/BurgerQuest'
      ),
      // A list article that happens to sit in the category: no infobox, no mod.
      {
        pageid: 300,
        title: 'List of unfinished mods',
        revisions: [{ slots: { main: { content: '[[Category:List]]' } } }]
      }
    ]
  }
}

const IMAGEINFO = {
  batchcomplete: true,
  query: {
    pages: [
      {
        pageid: 9,
        title: 'File:The Missing Link.jpg',
        imageinfo: [
          {
            thumburl:
              'https://static.wikia.nocookie.net/zelda-64-mods/images/9/9b/The_Missing_Link.jpg/revision/latest/scale-to-width-down/312'
          }
        ]
      },
      // A red link: the page names an image nobody ever uploaded.
      { title: 'File:Missing Image.png', missing: true }
    ]
  }
}

let server: Server

function startServer(handler: RequestListener): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

/** Routes on the api.php query parameters, the way the real API dispatches. */
function wikiApi(overrides: { imageinfo?: unknown } = {}): RequestListener {
  return (req, res) => {
    const params = new URL(req.url ?? '', 'http://x').searchParams
    const body = params.get('prop')?.includes('imageinfo')
      ? (overrides.imageinfo ?? IMAGEINFO)
      : params.has('gcmcontinue')
        ? SECOND_BATCH
        : FIRST_BATCH

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
}

describe('ZeldaFandomCatalogSource', () => {
  it('follows continuation, parses infoboxes and resolves thumbnails', async () => {
    const baseUrl = await startServer(wikiApi())
    const records = await new ZeldaFandomCatalogSource(baseUrl).fetchCatalog()

    // Both batches, minus the list article that carries no infobox.
    expect(records.map((record) => record.name)).toEqual(['The Missing Link', 'Burger Quest'])

    const [tml, burger] = records
    expect(tml.source).toBe('zeldafandom')
    // The page id, not the title: a rename must not orphan an installed mod.
    expect(tml.sourceId).toBe('172')
    expect(tml.author).toBe('Kaze, Zel')
    expect(tml.description).toMatch(/^A mini-adventure set between/)
    expect(tml.metadata).toMatchObject({
      completionStatus: 'Complete',
      pageUrl: `${baseUrl}/wiki/The_Missing_Link`,
      thumbnailUrl: expect.stringContaining('scale-to-width-down/312')
    })

    // A page naming an image that was never uploaded just has no thumbnail.
    expect(burger.metadata).toMatchObject({ thumbnailUrl: null })
  })

  it('prefers a download link the installer can actually use', async () => {
    const baseUrl = await startServer(wikiApi())
    const records = await new ZeldaFandomCatalogSource(baseUrl).fetchCatalog()

    // romhacking.net is listed first, but it's a landing page; the .bps is not.
    expect(records[0].metadata).toMatchObject({
      downloadLink: 'https://hylianmodding.com/mods/the_missing_link/downloads/tml.bps'
    })

    // Nothing installable anywhere: the landing page is kept so the row can
    // still send the user somewhere.
    expect(records[1].metadata).toMatchObject({
      downloadLink: 'https://www.mediafire.com/file/abc/BurgerQuest'
    })
  })

  it('reports a MediaWiki error returned with a 200', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'readapidenied', info: 'Read access denied' } }))
    })

    await expect(new ZeldaFandomCatalogSource(baseUrl).fetchCatalog()).rejects.toThrow(
      CatalogFetchError
    )
  })

  it('reports an HTTP failure', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(503)
      res.end('unavailable')
    })

    await expect(new ZeldaFandomCatalogSource(baseUrl).fetchCatalog()).rejects.toThrow(/503/)
  })
})
