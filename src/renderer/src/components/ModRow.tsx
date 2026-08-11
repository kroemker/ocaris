import ModThumbnail from './ModThumbnail'
import ModRowActions from './ModRowActions'
import { isNewMod, sourceLabel, type ActionContext, type ModActionId } from '../lib/library'
import type { ModSummary } from '@shared/ipc'

interface ModRowProps {
  mod: ModSummary
  context: ActionContext
  onAction: (action: ModActionId, mod: ModSummary, emulatorId?: number) => void
}

function ModRow({ mod, context, onAction }: ModRowProps): React.JSX.Element {
  const isError = mod.status.state === 'error'
  const classes = ['row']
  if (isError) classes.push('is-error')
  if (mod.prefs.hidden) classes.push('is-hidden-mod')

  return (
    <article className={classes.join(' ')}>
      {/* The thumbnail is the row's large click target for the details
          dialog; the title is the accessible one. */}
      <button
        className="thumb-button"
        aria-label={`Details for ${mod.name}`}
        tabIndex={-1}
        onClick={() => onAction('details', mod)}
      >
        <ModThumbnail mod={mod} />
      </button>

      <div className="body">
        <h2 className="title clip">
          <button className="linklike" onClick={() => onAction('details', mod)}>
            {mod.name}
          </button>
          {isNewMod(mod) && <span className="tag new">New</span>}
        </h2>
        <div className="meta">
          {mod.author && <span className="clip">{mod.author}</span>}
          {mod.author && mod.completionStatus && <span className="sep">·</span>}
          {mod.completionStatus && <span>{mod.completionStatus}</span>}
          {/* Which catalog(s) this row came from - a merged row lists both,
              which is also the explanation for why it only appears once. */}
          {mod.sources.map((source) => (
            <span className="src" key={source.source}>
              {sourceLabel(source.source)}
            </span>
          ))}
        </div>
        {/* An error replaces the description: what went wrong matters more
            than what the mod is, and the row only has two lines to give. */}
        <p className={`desc${isError ? ' err' : ''}`}>
          {isError ? mod.status.errorMessage : mod.description}
        </p>
      </div>

      {/* Favourite and hide sit apart from the state-driven actions: they
          apply in every state and shouldn't move around as one changes. */}
      <div className="marks">
        <button
          className={`btn icon sm ghost${mod.prefs.favorite ? ' on' : ''}`}
          aria-pressed={mod.prefs.favorite}
          title={mod.prefs.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onAction('toggleFavorite', mod)}
        >
          {mod.prefs.favorite ? '★' : '☆'}
        </button>
        <button
          className="btn icon sm ghost"
          aria-pressed={mod.prefs.hidden}
          title={mod.prefs.hidden ? 'Show in the library again' : 'Hide from the library'}
          onClick={() => onAction('toggleHidden', mod)}
        >
          {mod.prefs.hidden ? '👁' : '🚫'}
        </button>
      </div>

      <ModRowActions mod={mod} context={context} onAction={onAction} />
    </article>
  )
}

export default ModRow
