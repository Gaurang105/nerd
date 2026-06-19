import type { Corner } from '@shared/types'

interface Props {
  hidden: boolean
  listening: boolean
  showConfig: boolean
  onToggleConfig: () => void
  onToggleHidden: () => void
  onToggleListening: () => void
  onCollapse: () => void
  onSnap: (corner: Corner) => void
}

const CORNERS: { corner: Corner; glyph: string; title: string }[] = [
  { corner: 'top-left', glyph: '↖', title: 'Dock top-left (Cmd+Up)' },
  { corner: 'top-right', glyph: '↗', title: 'Dock top-right (Cmd+Right)' },
  { corner: 'bottom-left', glyph: '↙', title: 'Dock bottom-left (Cmd+Left)' },
  { corner: 'bottom-right', glyph: '↘', title: 'Dock bottom-right (Cmd+Down)' }
]

function WidgetHeader({
  hidden,
  listening,
  showConfig,
  onToggleConfig,
  onToggleHidden,
  onToggleListening,
  onCollapse,
  onSnap
}: Props): React.JSX.Element {
  return (
    <div className="nerd-header">
      <span className="brand">nerd</span>
      <button
        className={`nerd-indicator ${hidden ? 'hidden' : 'visible'}`}
        title="Toggle hidden mode (excluded from screen share)"
        onClick={onToggleHidden}
      >
        <span className="dot" />
        {hidden ? 'Hidden' : 'Visible'}
      </button>
      <button
        className={`nerd-indicator ${listening ? 'live' : 'off'}`}
        title="Start/stop listening (mic + system audio)"
        onClick={onToggleListening}
      >
        <span className="dot" />
        {listening ? 'Live' : 'Mic off'}
      </button>
      <span className="spacer" />
      <div className="corner-pad">
        {CORNERS.map((c) => (
          <button
            key={c.corner}
            className="nerd-btn"
            title={c.title}
            onClick={() => onSnap(c.corner)}
          >
            {c.glyph}
          </button>
        ))}
      </div>
      <button
        className={`nerd-btn ${showConfig ? 'active' : ''}`}
        title="Settings"
        onClick={onToggleConfig}
      >
        ⚙
      </button>
      <button className="nerd-btn" title="Collapse" onClick={onCollapse}>
        –
      </button>
    </div>
  )
}

export default WidgetHeader
