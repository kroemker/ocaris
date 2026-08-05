import { describe, expect, it } from 'vitest'
import { mergeCatalogs, normalizeModName } from '../../../src/main/catalog/merge'
import type { CatalogMetadata } from '../../../src/main/catalog/types'
import type { ModRecord } from '../../../src/main/db/mods'

function record(
  source: string,
  sourceId: string,
  name: string,
  fields: Partial<Omit<ModRecord, 'source' | 'sourceId' | 'name'>> & {
    metadata?: Partial<CatalogMetadata>
  } = {}
): ModRecord {
  return {
    source,
    sourceId,
    name,
    author: fields.author ?? null,
    description: fields.description ?? null,
    metadata: fields.metadata ?? null
  }
}

describe('normalizeModName', () => {
  it('ignores case and punctuation so the same mod matches across sources', () => {
    expect(normalizeModName("Zelda's Birthday")).toBe(normalizeModName('zelda_s_birthday'))
    // The wiki uses a curly apostrophe on some titles.
    expect(normalizeModName('Zelda’s Birthday')).toBe(normalizeModName("Zelda's Birthday"))
    expect(normalizeModName('Zelda 64: Dawn and Dusk')).toBe(
      normalizeModName('zelda64_dawn_and_dusk')
    )
  })

  it('keeps genuinely different mods apart', () => {
    expect(normalizeModName("Demon's Quest")).not.toBe(
      normalizeModName("Demon's Quest is now 2 Percent Done")
    )
  })
})

describe('mergeCatalogs', () => {
  it('keeps the primary source id so an installed mod keeps its row', () => {
    const merged = mergeCatalogs([
      [record('hylianmodding', 'the_missing_link', 'The Missing Link')],
      [record('zeldafandom', '172', 'The Missing Link')]
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('hylianmodding')
    expect(merged[0].sourceId).toBe('the_missing_link')
    expect((merged[0].metadata as CatalogMetadata).sources).toEqual([
      { source: 'hylianmodding', sourceId: 'the_missing_link', pageUrl: null },
      { source: 'zeldafandom', sourceId: '172', pageUrl: null }
    ])
  })

  it('takes the longest description and the first thumbnail', () => {
    const merged = mergeCatalogs([
      [
        record('hylianmodding', 'a', 'Shared', {
          description: 'Short.',
          metadata: { thumbnailUrl: 'https://hylianmodding.test/a.png' }
        })
      ],
      [
        record('zeldafandom', '1', 'Shared', {
          description: 'A considerably longer blurb that actually says something about the mod.',
          metadata: { thumbnailUrl: 'https://wiki.test/a.png' }
        })
      ]
    ])

    expect(merged[0].description).toMatch(/considerably longer/)
    expect((merged[0].metadata as CatalogMetadata).thumbnailUrl).toBe(
      'https://hylianmodding.test/a.png'
    )
  })

  it('prefers an installable download link over a landing page from any source', () => {
    const merged = mergeCatalogs([
      [
        record('hylianmodding', 'a', 'Shared', {
          metadata: { downloadLink: 'https://hylianmodding.test/mods/a/downloads/a.7z' }
        })
      ],
      [
        record('zeldafandom', '1', 'Shared', {
          metadata: { downloadLink: 'https://wiki.test/files/a.bps' }
        })
      ]
    ])

    // .7z is the primary's link but the installer can't open it; the wiki's
    // .bps can, so it wins despite the lower priority.
    expect((merged[0].metadata as CatalogMetadata).downloadLink).toBe(
      'https://wiki.test/files/a.bps'
    )
  })

  it('falls back to the primary link when nothing is installable', () => {
    const merged = mergeCatalogs([
      [
        record('hylianmodding', 'a', 'Shared', {
          metadata: { downloadLink: 'https://github.test/owner/repo/releases' }
        })
      ],
      [
        record('zeldafandom', '1', 'Shared', {
          metadata: { downloadLink: 'https://mediafire.test/x' }
        })
      ]
    ])

    expect((merged[0].metadata as CatalogMetadata).downloadLink).toBe(
      'https://github.test/owner/repo/releases'
    )
  })

  it('never merges two entries from the same source', () => {
    // A source knows its own entries are distinct; matching keys there mean
    // the key is too coarse, not that the mods are the same.
    const merged = mergeCatalogs([
      [record('zeldafandom', '1', 'Escape Room'), record('zeldafandom', '2', 'escape room')]
    ])

    expect(merged).toHaveLength(2)
    expect(merged.map((mod) => mod.sourceId)).toEqual(['1', '2'])
  })

  it('carries a single-source mod through with its own source listed', () => {
    const merged = mergeCatalogs([[], [record('zeldafandom', '9', 'Wiki Only')]])

    expect(merged).toHaveLength(1)
    expect((merged[0].metadata as CatalogMetadata).sources).toEqual([
      { source: 'zeldafandom', sourceId: '9', pageUrl: null }
    ])
  })
})
