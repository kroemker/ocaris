import ModRow from './ModRow'
import {
  groupModsByState,
  STATUS_LABELS,
  type ActionContext,
  type ModActionId
} from '../lib/library'
import type { ModSummary } from '@shared/ipc'

interface ModListProps {
  mods: readonly ModSummary[]
  groupByState: boolean
  context: ActionContext
  busyIds: ReadonlySet<string>
  onAction: (action: ModActionId, mod: ModSummary, emulatorId?: number) => void
}

function ModList({
  mods,
  groupByState,
  context,
  busyIds,
  onAction
}: ModListProps): React.JSX.Element {
  const row = (mod: ModSummary): React.JSX.Element => (
    <ModRow
      key={mod.id}
      mod={mod}
      context={{ ...context, busy: busyIds.has(mod.id) }}
      onAction={onAction}
    />
  )

  if (!groupByState) {
    return <div className="list">{mods.map(row)}</div>
  }

  return (
    <div className="list">
      {groupModsByState(mods).map((group) => (
        <section className="modgroup" key={group.state}>
          <h3 className="modgroup-heading">
            {STATUS_LABELS[group.state].text}
            <span className="n">{group.mods.length}</span>
          </h3>
          {group.mods.map(row)}
        </section>
      ))}
    </div>
  )
}

export default ModList
