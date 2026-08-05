import ModThumbnail from './ModThumbnail'
import ModRowActions from './ModRowActions'
import { sourceLabel, type ActionContext, type ModActionId } from '../lib/library'
import type { ModSummary } from '@shared/ipc'

interface ModRowProps {
  mod: ModSummary
  context: ActionContext
  onAction: (action: ModActionId, mod: ModSummary) => void
}

function ModRow({ mod, context, onAction }: ModRowProps): React.JSX.Element {
  const isError = mod.status.state === 'error'

  return (
    <article className={`row${isError ? ' is-error' : ''}`}>
      <ModThumbnail mod={mod} />

      <div className="body">
        <h2 className="title clip">{mod.name}</h2>
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

      <ModRowActions mod={mod} context={context} onAction={onAction} />
    </article>
  )
}

export default ModRow
