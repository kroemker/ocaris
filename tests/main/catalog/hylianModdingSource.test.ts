import { createServer, type RequestListener, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { HylianModdingCatalogSource } from '../../../src/main/catalog/hylianModdingSource'
import { CatalogFetchError } from '../../../src/main/catalog/types'

// Fixtures below are trimmed/adapted from real responses captured from
// hylianmodding.com during the WP5 investigation (see
// docs/catalog-source-spec.md), not invented shapes.

const INDEX_FIXTURE = {
  mods: [
    'zelda64_dawn_and_dusk',
    'majoras_mask_chaos_edition',
    'star_fox_64_survival',
    'missing_mod'
  ]
}

const DAWN_AND_DUSK_FIXTURE = {
  name: 'Zelda 64: Dawn and Dusk',
  id: 'zelda64_dawn_and_dusk',
  authors: ['Captain Seedy-Eye', 'LuigiBlood', 'PK-LOVE', 'BWXIX'],
  description: 'An expansion disk for OoT demonstrating 64DD support.',
  category: 'mod',
  supported_games: 'OoT',
  completion_status: 'complete',
  thumbnail_image: '/mods/zelda64_dawn_and_dusk/screenshots/thumbnail.jpg',
  screenshots: ['/mods/zelda64_dawn_and_dusk/screenshots/screenshot_0.jpg'],
  download_link: '/mods/zelda64_dawn_and_dusk/downloads/Zelda64DawnDusk_v2_ROM_Patches.zip',
  last_updated: '2023-10-14',
  timestamp: '1697285062857',
  is_update: false,
  changelog: []
}

const MM_FIXTURE = {
  name: "Majora's Mask: Chaos Edition",
  id: 'majoras_mask_chaos_edition',
  authors: ['GabrielCNoble'],
  description: 'A chaos mod for Majoras Mask.',
  category: 'mod',
  supported_games: 'MM',
  completion_status: 'complete',
  download_link: 'https://github.com/GabrielCNoble/mm-chaos/releases'
}

const STAR_FOX_FIXTURE = {
  name: 'Star Fox 64 Survival',
  id: 'star_fox_64_survival',
  authors: ['Someone'],
  description: 'A Star Fox 64 hack in the OoT engine.',
  category: 'mod',
  supported_games: 'OoT',
  completion_status: 'complete',
  // Observed in the wild without a leading slash.
  download_link: 'mods/star_fox_64_survival/downloads/StarFox64SurvivalV14.zip'
}

let server: Server

function startServer(handler: RequestListener): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve(`http://127.0.0.1:${address.port}`)
      }
    })
  })
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve))
})

function jsonRoutes(routes: Record<string, unknown>): RequestListener {
  return (req, res) => {
    const path = (req.url ?? '').split('?')[0]
    if (path in routes) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(routes[path]))
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  }
}

describe('HylianModdingCatalogSource', () => {
  it('fetches the index, resolves details, and filters to supported_games=OoT', async () => {
    const baseUrl = await startServer(
      jsonRoutes({
        '/mods/index.json': INDEX_FIXTURE,
        '/mods/zelda64_dawn_and_dusk/mod.json': DAWN_AND_DUSK_FIXTURE,
        '/mods/majoras_mask_chaos_edition/mod.json': MM_FIXTURE,
        '/mods/star_fox_64_survival/mod.json': STAR_FOX_FIXTURE
        // 'missing_mod' deliberately has no route -> 404
      })
    )

    const source = new HylianModdingCatalogSource(baseUrl)
    const records = await source.fetchCatalog()

    // MM entry filtered out, missing_mod skipped rather than failing the batch.
    expect(records.map((r) => r.sourceId).sort()).toEqual([
      'star_fox_64_survival',
      'zelda64_dawn_and_dusk'
    ])

    const dawnAndDusk = records.find((r) => r.sourceId === 'zelda64_dawn_and_dusk')
    expect(dawnAndDusk?.source).toBe('hylianmodding')
    expect(dawnAndDusk?.name).toBe('Zelda 64: Dawn and Dusk')
    expect(dawnAndDusk?.author).toBe('Captain Seedy-Eye, LuigiBlood, PK-LOVE, BWXIX')
    expect((dawnAndDusk?.metadata as { downloadLink: string }).downloadLink).toBe(
      `${baseUrl}/mods/zelda64_dawn_and_dusk/downloads/Zelda64DawnDusk_v2_ROM_Patches.zip`
    )
  })

  it('resolves a download_link without a leading slash against the site origin', async () => {
    const baseUrl = await startServer(
      jsonRoutes({
        '/mods/index.json': { mods: ['star_fox_64_survival'] },
        '/mods/star_fox_64_survival/mod.json': STAR_FOX_FIXTURE
      })
    )

    const source = new HylianModdingCatalogSource(baseUrl)
    const [record] = await source.fetchCatalog()

    expect((record.metadata as { downloadLink: string }).downloadLink).toBe(
      `${baseUrl}/mods/star_fox_64_survival/downloads/StarFox64SurvivalV14.zip`
    )
  })

  it('leaves an absolute external download_link untouched', async () => {
    const baseUrl = await startServer(
      jsonRoutes({
        '/mods/index.json': { mods: ['majoras_mask_chaos_edition'] },
        '/mods/majoras_mask_chaos_edition/mod.json': { ...MM_FIXTURE, supported_games: 'OoT' }
      })
    )

    const source = new HylianModdingCatalogSource(baseUrl)
    const [record] = await source.fetchCatalog()

    expect((record.metadata as { downloadLink: string }).downloadLink).toBe(
      'https://github.com/GabrielCNoble/mm-chaos/releases'
    )
  })

  it('throws CatalogFetchError when the index itself is unreachable', async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(500)
      res.end('server error')
    })

    const source = new HylianModdingCatalogSource(baseUrl)
    await expect(source.fetchCatalog()).rejects.toThrow(CatalogFetchError)
  })
})
