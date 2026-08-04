import { useState } from 'react'
import {
  actionsFor,
  formatProgress,
  STATUS_LABELS,
  type ActionContext,
  type ModActionId
} from '../lib/library'
import type { ModSummary } from '@shared/ipc'

interface ModRowActionsProps {
  mod: ModSummary
  context: ActionContext
  onAction: (action: ModActionId, mod: ModSummary) => void
}

/**
 * The row's right rail: status label on top, then the actions for that state.
 */
function ModRowActions({ mod, context, onAction }: ModRowActionsProps): React.JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const status = STATUS_LABELS[mod.status.state]
  const actions = actionsFor(mod, context)

  const primary = actions.filter((action) => action.primary)
  const secondary = actions.filter((action) => !action.primary)

  // Removing deletes a patched ROM, so it confirms in place rather than
  // firing on the first click. Re-downloading rebuilds it, hence no modal.
  if (confirmingRemove) {
    return (
      <div className="side">
        <div className="confirm">Remove the patched ROM?</div>
        <div className="row-actions">
          <button className="btn sm ghost" onClick={() => setConfirmingRemove(false)}>
            Keep
          </button>
          <button
            className="btn sm danger"
            onClick={() => {
              setConfirmingRemove(false)
              onAction('remove', mod)
            }}
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="side">
      <div className={`status ${status.className}`}>
        <span className="dot" />
        {status.text}
      </div>

      {mod.status.state === 'downloading' &&
        (() => {
          const progress = formatProgress(mod.status)
          return (
            <div className="prog">
              <div className="bar">
                <i style={{ width: `${progress.percent ?? 0}%` }} />
              </div>
              <div className="num">{progress.label}</div>
            </div>
          )
        })()}

      {primary.map((action) => (
        <button
          key={action.id}
          className="btn primary"
          disabled={action.disabled}
          title={action.disabled ? action.disabledReason : undefined}
          onClick={() => onAction(action.id, mod)}
        >
          {action.label}
        </button>
      ))}

      {secondary.length > 0 && (
        <div className="row-actions">
          {secondary.map((action) => (
            <button
              key={action.id}
              className={`btn sm ${action.id === 'remove' ? 'ghost danger' : 'ghost'}`}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
              onClick={() =>
                action.id === 'remove' ? setConfirmingRemove(true) : onAction(action.id, mod)
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ModRowActions
