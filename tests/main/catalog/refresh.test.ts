import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../../src/main/db/migrations'
import { listModsWithStatus, setModStatus } from '../../../src/main/db/mods'
import { refreshCatalog } from '../../../src/main/catalog/refresh'
import type { ModCatalogSource } from '../../../src/main/catalog/types'
import type { ModRecord } from '../../../src/main/db/mods'

function fakeSource(records: ModRecord[]): ModCatalogSource {
  return {
    id: 'fake',
    fetchCatalog: () => Promise.resolve(records)
  }
}

describe('refreshCatalog', () => {
  it('upserts fetched records and reports a count', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    const result = await refreshCatalog(
      db,
      fakeSource([
        {
          source: 'fake',
          sourceId: '1',
          name: 'Mod One',
          author: null,
          description: null,
          metadata: null
        },
        {
          source: 'fake',
          sourceId: '2',
          name: 'Mod Two',
          author: null,
          description: null,
          metadata: null
        }
      ])
    )

    expect(result).toEqual({ source: 'fake', count: 2, refreshedAt: expect.any(Number) })
    expect(listModsWithStatus(db)).toHaveLength(2)

    db.close()
  })

  it('does not reset an in-progress download status on refresh', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    await refreshCatalog(
      db,
      fakeSource([
        {
          source: 'fake',
          sourceId: '1',
          name: 'Mod One',
          author: null,
          description: null,
          metadata: null
        }
      ])
    )

    setModStatus(db, 'fake:1', { state: 'ready', patchedRomPath: '/roms/1.z64' })

    await refreshCatalog(
      db,
      fakeSource([
        {
          source: 'fake',
          sourceId: '1',
          name: 'Mod One (renamed)',
          author: null,
          description: null,
          metadata: null
        }
      ])
    )

    const [mod] = listModsWithStatus(db)
    expect(mod.name).toBe('Mod One (renamed)')
    expect(mod.status.state).toBe('ready')
    expect(mod.status.patchedRomPath).toBe('/roms/1.z64')

    db.close()
  })
})
