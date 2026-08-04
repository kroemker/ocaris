import { FILTERS, SORTS, type LibraryFilter, type LibrarySort } from '../lib/library'

interface FilterChipsProps {
  active: LibraryFilter
  counts: Record<LibraryFilter, number>
  sort: LibrarySort
  onFilterChange: (filter: LibraryFilter) => void
  onSortChange: (sort: LibrarySort) => void
}

function FilterChips({
  active,
  counts,
  sort,
  onFilterChange,
  onSortChange
}: FilterChipsProps): React.JSX.Element {
  return (
    <div className="filterbar">
      {FILTERS.map((filter) => {
        const count = counts[filter.id]
        const classes = ['chip']
        if (filter.id === active) classes.push('on')
        // "Needs attention" only reads as a warning when there's something in it.
        if (filter.alert && count > 0) classes.push('alert')
        if (count === 0 && filter.id !== 'all') classes.push('empty')

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
