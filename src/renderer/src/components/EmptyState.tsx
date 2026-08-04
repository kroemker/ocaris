interface EmptyStateProps {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}

function EmptyState({ title, body, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action && (
        <button className="btn primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
