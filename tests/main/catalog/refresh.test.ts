import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../../src/main/db/migrations'
import { listModsWithStatus, setModStatus } from '../../../src/main/db/mods'
import { refreshCatalog } from '../../../src/main/catalog/refresh'
import { CatalogFetchError, type ModCatalogSource } from '../../../src/main/catalog/types'
import type { ModRecord } from '../../../src/main/db/mods'

function record(source: string, sourceId: string, name: string): ModRecord {
  return { source, sourceId, name, author: null, description: null, metadata: null }
}

function fakeSource(id: string, records: ModRecord[]): ModCatalogSource {
  return { id, fetchCatalog: () => Promise.resolve(records) }
}

function failingSource(id: string, message: string): ModCatalogSource {
  return { id, fetchCatalog: () => Promise.reject(new CatalogFetchError(message)) }
}

describe('refreshCatalog', () => {
  it('upserts fetched records and reports a count per source', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    const result = await refreshCatalog(db, [
      fakeSource('fake', [record('fake', '1', 'Mod One'), record('fake', '2', 'Mod Two')])
    ])

    expect(result).toEqual({
      count: 2,
      refreshedAt: expect.any(Number),
      sources: [{ source: 'fake', count: 2, errorMessage: null }]
    })
    expect(listModsWithStatus(db)).toHaveLength(2)

    db.close()
  })

  it('merges the same mod from two sources into one row', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    const result = await refreshCatalog(db, [
      fakeSource('primary', [record('primary', 'a', 'Shared Mod')]),
      fakeSource('secondary', [
        record('secondary', '9', 'shared mod!'),
        record('secondary', '10', 'Wiki Only')
      ])
    ])

    expect(result.count).toBe(2)
    expect(result.sources.map((source) => source.count)).toEqual([1, 2])

    const mods = listModsWithStatus(db)
    expect(mods.map((mod) => mod.id)).toEqual(['primary:a', 'secondary:10'])

    db.close()
  })

  it('keeps the other sources when one fails', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    const result = await refreshCatalog(db, [
      fakeSource('up', [record('up', '1', 'Mod One')]),
      failingSource('down', 'HTTP 503')
    ])

    // A catalog being unreachable costs its own entries, nothing else.
    expect(result.count).toBe(1)
    expect(result.sources[1]).toEqual({ source: 'down', count: null, errorMessage: 'HTTP 503' })
    expect(listModsWithStatus(db)).toHaveLength(1)

    db.close()
  })

  it('fails the refresh when every source fails', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    await expect(
      refreshCatalog(db, [failingSource('a', 'boom'), failingSource('b', 'bang')])
    ).rejects.toThrow(/Every catalog source failed/)

    db.close()
  })

  it('does not reset an in-progress download status on refresh', async () => {
    const db = new Database(':memory:')
    runMigrations(db)

    await refreshCatalog(db, [fakeSource('fake', [record('fake', '1', 'Mod One')])])

    setModStatus(db, 'fake:1', { state: 'ready', patchedRomPath: '/roms/1.z64' })

    await refreshCatalog(db, [fakeSource('fake', [record('fake', '1', 'Mod One (renamed)')])])

    const [mod] = listModsWithStatus(db)
    expect(mod.name).toBe('Mod One (renamed)')
    expect(mod.status.state).toBe('ready')
    expect(mod.status.patchedRomPath).toBe('/roms/1.z64')

    db.close()
  })
})
