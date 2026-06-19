export function ManualInputBar(): React.JSX.Element {
  return (
    <div className="panel-input-bar">
      <input
        type="text"
        className="panel-input"
        placeholder="Ask Nerd..."
        data-testid="manual-input"
      />
    </div>
  )
}
