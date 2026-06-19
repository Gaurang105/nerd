import type { Corner } from '@nerd/shared'
import { ManualInputBar } from './ManualInputBar'
import { AnswerPanel } from './AnswerPanel'
import { BriefingCard } from './BriefingCard'
import { ModeSelector } from './ModeSelector'
import { TranscriptFeed } from './TranscriptFeed'
import { AudioToggle } from './AudioToggle'

interface PanelViewProps {
  onCollapse: () => void
}

const CORNERS: Array<{ corner: Corner; glyph: string; label: string }> = [
  { corner: 'top-left', glyph: '↖', label: 'Snap to top-left' },
  { corner: 'top-right', glyph: '↗', label: 'Snap to top-right' },
  { corner: 'bottom-left', glyph: '↙', label: 'Snap to bottom-left' },
  { corner: 'bottom-right', glyph: '↘', label: 'Snap to bottom-right' }
]

export function PanelView({ onCollapse }: PanelViewProps): React.JSX.Element {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-name">Nerd</span>
        <ModeSelector />
        <AudioToggle />
        {CORNERS.map(({ corner, glyph, label }) => (
          <button
            key={corner}
            type="button"
            className="panel-btn"
            onClick={() => window.nerd.snapToCorner(corner)}
            aria-label={label}
            title={label}
          >
            {glyph}
          </button>
        ))}
        <button
          type="button"
          className="panel-btn"
          onClick={onCollapse}
          aria-label="Collapse"
          title="Collapse"
        >
          ×
        </button>
      </div>
      <div className="panel-body">
        <div className="panel-area" style={{ flexBasis: '35%' }}>
          <BriefingCard />
        </div>
        <div className="panel-area" style={{ flexBasis: '40%' }}>
          <AnswerPanel />
        </div>
        <div className="panel-area" style={{ flexBasis: '25%', padding: 0, display: 'flex' }}>
          <TranscriptFeed />
        </div>
        <ManualInputBar />
      </div>
    </div>
  )
}
