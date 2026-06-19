interface PillViewProps {
  onExpand: () => void
}

export function PillView({ onExpand }: PillViewProps): React.JSX.Element {
  return (
    <div className="pill" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <span className="pill-name">Nerd</span>
      <span className="pill-hint">⌘↩</span>
      <button
        type="button"
        className="pill-btn"
        onClick={onExpand}
        aria-label="Expand panel"
        title="Expand"
      >
        ↗
      </button>
    </div>
  )
}
