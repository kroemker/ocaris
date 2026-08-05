import ModRow from './ModRow'
import type { ActionContext, ModActionId } from '../lib/library'
import type { ModSummary } from '@shared/ipc'

interface ModListProps {
  mods: readonly ModSummary[]
  context: ActionContext
  busyIds: ReadonlySet<string>
  onAction: (action: ModActionId, mod: ModSummary) => void
}

function ModList({ mods, context, busyIds, onAction }: ModListProps): React.JSX.Element {
  return (
    <div className="list">
      {mods.map((mod) => (
        <ModRow
          key={mod.id}
          mod={mod}
          context={{ ...context, busy: busyIds.has(mod.id) }}
          onAction={onAction}
        />
      ))}
    </div>
  )
}

export default ModList
