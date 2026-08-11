import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UI_STATE,
  MAX_QUERY_LENGTH,
  normalizeUiState,
  parseUiState
} from '../../src/shared/uiState'

describe('normalizeUiState', () => {
  it('keeps a fully valid state', () => {
    const state = {
      library: { filter: 'error', sort: 'status', groupByState: true, query: 'zelda' },
      settingsPane: 'storage'
    }

    expect(normalizeUiState(state)).toEqual(state)
  })

  it.each([[null], [undefined], ['nope'], [42], [[]]])(
    'falls back to the defaults for %p',
    (value) => {
      expect(normalizeUiState(value)).toEqual(DEFAULT_UI_STATE)
    }
  )

  it('replaces unknown enum values field by field, keeping the valid ones', () => {
    const normalized = normalizeUiState({
      library: { filter: 'bogus', sort: 'author', groupByState: true, query: 'x' },
      settingsPane: 'nonexistent'
    })

    expect(normalized).toEqual({
      library: { filter: 'all', sort: 'author', groupByState: true, query: 'x' },
      settingsPane: 'appearance'
    })
  })

  it('fills in missing fields', () => {
    expect(normalizeUiState({ library: { filter: 'ready' } })).toEqual({
      library: { filter: 'ready', sort: 'name', groupByState: false, query: '' },
      settingsPane: 'appearance'
    })
  })

  it('treats a non-boolean groupByState as off and a non-string query as empty', () => {
    const normalized = normalizeUiState({ library: { groupByState: 'yes', query: 12 } })

    expect(normalized.library.groupByState).toBe(false)
    expect(normalized.library.query).toBe('')
  })

  it('truncates an absurdly long query', () => {
    const normalized = normalizeUiState({ library: { query: 'a'.repeat(5000) } })

    expect(normalized.library.query).toHaveLength(MAX_QUERY_LENGTH)
  })

  it('accepts the filters and sorts that came later', () => {
    const state = {
      library: { filter: 'favorites', sort: 'recent', groupByState: false, query: '' },
      settingsPane: 'appearance'
    }
    expect(normalizeUiState(state)).toEqual(state)

    expect(normalizeUiState({ library: { filter: 'hidden' } }).library.filter).toBe('hidden')
  })

  it('ignores unknown keys', () => {
    expect(normalizeUiState({ somethingElse: true })).toEqual(DEFAULT_UI_STATE)
  })
})

describe('parseUiState', () => {
  it('reads back what was written', () => {
    const state = normalizeUiState({
      library: { filter: 'downloading', sort: 'status', groupByState: true, query: 'oot' },
      settingsPane: 'catalog'
    })

    expect(parseUiState(JSON.stringify(state))).toEqual(state)
  })

  it('returns the defaults for null and for invalid JSON', () => {
    expect(parseUiState(null)).toEqual(DEFAULT_UI_STATE)
    expect(parseUiState('{not json')).toEqual(DEFAULT_UI_STATE)
  })
})
