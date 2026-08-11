import { useEffect, useRef } from 'react'
import ModThumbnail from './ModThumbnail'
import PlayButton from './PlayButton'
import {
  actionsFor,
  formatDate,
  pageLink,
  sourceLabel,
  STATUS_LABELS,
  type ActionContext,
  type ModActionId
} from '../lib/library'
import type { Emulator, ModSummary } from '@shared/ipc'

interface ModDetailsProps {
  /** Null closes the dialog; the row that opened it is the only thing that
   *  decides which mod it shows. */
  mod: ModSummary | null
  context: ActionContext
  onClose: () => void
  onAction: (action: ModActionId, mod: ModSummary, emulatorId?: number) => void
  onEmulatorChange: (mod: ModSummary, emulatorId: number | null) => void
}

/**
 * Everything the row has to leave out: the untruncated description, every
 * source's page, when the mod was first seen, where its patched ROM landed,
 * and the per-mod emulator choice.
 */
function ModDetails({
  mod,
  context,
  onClose,
  onAction,
  onEmulatorChange
}: ModDetailsProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)

  // Same <dialog>.showModal() contract as the settings dialog: Esc, backdrop,
  // focus trap and focus restore all come from the element.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (mod && !dialog.open) dialog.showModal()
    else if (!mod && dialog.open) dialog.close()
  }, [mod])

  return (
    <dialog
      className="details"
      ref={ref}
      aria-label={mod ? `${mod.name} details` : 'Mod details'}
      onClose={onClose}
      onCancel={onClose}
    >
      {mod && (
        <ModDetailsBody
          mod={mod}
          context={context}
          onClose={onClose}
          onAction={onAction}
          onEmulatorChange={onEmulatorChange}
        />
      )}
    </dialog>
  )
}

/** Split out so every field reads from a non-null mod without a guard. */
function ModDetailsBody({
  mod,
  context,
  onClose,
  onAction,
  onEmulatorChange
}: ModDetailsProps & { mod: ModSummary }): React.JSX.Element {
  const status = STATUS_LABELS[mod.status.state]
  // Removing deletes a file and confirms in place in the row's rail; the
  // dialog offers everything else.
  const actions = actionsFor(mod, context).filter((action) => action.id !== 'remove')

  return (
    <div className="details-inner">
      <div className="modal-h">
        <h2 className="clip">{mod.name}</h2>
        <div className="spacer" />
        <button className="btn icon ghost" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>

      <div className="modal-b">
        <div className="details-top">
          <ModThumbnail mod={mod} />
          <div className="details-facts">
            <div className={`status ${status.className}`}>
              <span className="dot" />
              {status.text}
            </div>
            {mod.author && <div>{mod.author}</div>}
            {mod.completionStatus && <div className="dim">{mod.completionStatus}</div>}
            {mod.firstSeenAt !== null && (
              <div className="dim">Added {formatDate(mod.firstSeenAt)}</div>
            )}
          </div>
        </div>

        {mod.status.errorMessage && <p className="details-error">{mod.status.errorMessage}</p>}

        <p className="details-desc">{mod.description ?? 'This mod has no description.'}</p>

        <dl className="details-list">
          <dt>Sources</dt>
          <dd className="details-sources">
            {mod.sources.map((source) => (
              <span key={source.source}>
                {sourceLabel(source.source)}
                {source.pageUrl && (
                  <button
                    className="linklike"
                    onClick={() => void window.api.shell.openExternal(source.pageUrl as string)}
                  >
                    open ↗
                  </button>
                )}
              </span>
            ))}
          </dd>

          {mod.status.patchedRomPath && (
            <>
              <dt>Patched ROM</dt>
              <dd className="path">{mod.status.patchedRomPath}</dd>
            </>
          )}

          {context.emulators.length > 0 && (
            <>
              <dt>Play with</dt>
              <dd>
                <EmulatorChoice
                  mod={mod}
                  emulators={context.emulators}
                  onChange={(emulatorId) => onEmulatorChange(mod, emulatorId)}
                />
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="modal-f">
        <button
          className={`btn${mod.prefs.favorite ? ' on' : ''}`}
          aria-pressed={mod.prefs.favorite}
          onClick={() => onAction('toggleFavorite', mod)}
        >
          {mod.prefs.favorite ? '★ Favorited' : '☆ Favorite'}
        </button>
        <button
          className="btn"
          aria-pressed={mod.prefs.hidden}
          onClick={() => onAction('toggleHidden', mod)}
        >
          {mod.prefs.hidden ? 'Unhide' : 'Hide'}
        </button>

        <div className="spacer" />

        {pageLink(mod) && !actions.some((action) => action.id === 'openPage') && (
          <button className="btn" onClick={() => onAction('openPage', mod)}>
            Open page ↗
          </button>
        )}

        {actions.map((action) =>
          action.id === 'play' ? (
            <PlayButton
              key={action.id}
              label={action.label}
              disabled={action.disabled}
              disabledReason={action.disabledReason}
              emulators={context.emulators}
              preferredEmulatorId={mod.prefs.emulatorId}
              onPlay={(emulatorId) => onAction('play', mod, emulatorId)}
            />
          ) : (
            <button
              key={action.id}
              className={action.primary ? 'btn primary' : 'btn'}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
              onClick={() => onAction(action.id, mod)}
            >
              {action.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}

interface EmulatorChoiceProps {
  mod: ModSummary
  emulators: readonly Emulator[]
  onChange: (emulatorId: number | null) => void
}

/** The empty value is "no override": the mod follows whatever the app-wide
 *  default happens to be, including after that default changes. */
function EmulatorChoice({ mod, emulators, onChange }: EmulatorChoiceProps): React.JSX.Element {
  return (
    <select
      className="sortsel"
      aria-label="Emulator for this mod"
      value={mod.prefs.emulatorId ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      <option value="">Default emulator</option>
      {emulators.map((emulator) => (
        <option key={emulator.id} value={emulator.id}>
          {emulator.name}
        </option>
      ))}
    </select>
  )
}

export default ModDetails
