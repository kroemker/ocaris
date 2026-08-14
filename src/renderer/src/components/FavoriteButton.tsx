interface FavoriteButtonProps {
  favorite: boolean
  onToggle: () => void
  /** The details dialog gets the larger one; the row's sits beside its title. */
  size?: 'md' | 'lg'
}

/**
 * The one control offered in every state, drawn as a star that is an outline
 * until it is filled. Stroke and fill both follow currentColor, so the filled
 * state is a single class away.
 */
function FavoriteButton({
  favorite,
  onToggle,
  size = 'md'
}: FavoriteButtonProps): React.JSX.Element {
  return (
    <button
      className={`fav ${size}${favorite ? ' on' : ''}`}
      aria-pressed={favorite}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden focusable="false">
        <path
          d="M12 3.4l2.7 5.47 6.04.88-4.37 4.26 1.03 6.01L12 17.24l-5.4 2.84 1.03-6.01L3.26 9.8l6.04-.88L12 3.4z"
          fill={favorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export default FavoriteButton
