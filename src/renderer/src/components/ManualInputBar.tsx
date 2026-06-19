import { useState } from 'react'

function ManualInputBar({ onAsk }: { onAsk: (q: string) => void }): React.JSX.Element {
  const [value, setValue] = useState('')

  const submit = (): void => {
    const q = value.trim()
    if (!q) return
    onAsk(q)
    setValue('')
  }

  return (
    <div className="nerd-input-bar">
      <input
        className="nerd-input"
        placeholder="Ask nerd a question…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button className="nerd-btn" onClick={submit} title="Ask (Enter)">
        Ask
      </button>
    </div>
  )
}

export default ManualInputBar
