import type { Mode } from '@shared/types'
import { CheckIcon } from './icons'

interface Props {
  modes: Mode[]
  onPick: (id: string) => void
  onOpenSettings: () => void
}

function ModeDropdown({ modes, onPick, onOpenSettings }: Props): React.JSX.Element {
  return (
    <div className="mode-dropdown">
      {modes.length === 0 && <div className="mode-item muted">No modes yet</div>}
      {modes.map((m) => (
        <button
          key={m.id}
          className={`mode-item ${m.isDefault ? 'active' : ''}`}
          onClick={() => onPick(m.id)}
        >
          <span>{m.name}</span>
          {m.isDefault && <CheckIcon size={14} />}
        </button>
      ))}
      <button className="mode-item add" onClick={onOpenSettings}>
        Manage modes…
      </button>
    </div>
  )
}

export default ModeDropdown
