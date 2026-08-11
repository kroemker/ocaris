import { FILTERS, SORTS, type LibraryFilter, type LibrarySort } from '../lib/library'

interface FilterChipsProps {
  active: LibraryFilter
  counts: Record<LibraryFilter, number>
  sort: LibrarySort
  groupByState: boolean
  onFilterChange: (filter: LibraryFilter) => void
  onSortChange: (sort: LibrarySort) => void
  onGroupByStateChange: (groupByState: boolean) => void
}

function FilterChips({
  active,
  counts,
  sort,
  groupByState,
  onFilterChange,
  onSortChange,
  onGroupByStateChange
}: FilterChipsProps): React.JSX.Element {
  return (
    <div className="filterbar">
      {FILTERS.map((filter) => {
        const count = counts[filter.id]
        // An on-demand chip ("Hidden") stays out of the bar until it has
        // something in it - or until it's the one selected, which is the only
        // way back out of an empty one.
        if (filter.onDemand && count === 0 && filter.id !== active) return null

        const classes = ['chip']
        if (filter.id === active) classes.push('on')
        // "Needs attention" only reads as a warning when there's something in it.
        if (filter.alert && count > 0) classes.push('alert')
        if (count === 0 && filter.id !== 'all') classes.push('zero')

        return (
          <button
            key={filter.id}
            className={classes.join(' ')}
            aria-pressed={filter.id === active}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}
            <span className="n">{count}</span>
          </button>
        )
      })}

      <span className="spacer" />

      <button
        type="button"
        className={groupByState ? 'chip on' : 'chip'}
        aria-pressed={groupByState}
        onClick={() => onGroupByStateChange(!groupByState)}
      >
        Group by state
      </button>

      <select
        className="sortsel"
        value={sort}
        aria-label="Sort mods"
        onChange={(e) => onSortChange(e.target.value as LibrarySort)}
      >
        {SORTS.map((option) => (
          <option key={option.id} value={option.id}>
            Sort: {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default FilterChips
