import { useState } from 'react'

export function ManualInputBar(): React.JSX.Element {
  const [value, setValue] = useState('')

  const submit = (): void => {
    const question = value.trim()
    if (!question) return
    void window.nerd.askManually({ requestId: Date.now().toString(), question })
    setValue('')
  }

  return (
    <div className="panel-input-bar">
      <input
        type="text"
        className="panel-input"
        placeholder="Ask Nerd..."
        data-testid="manual-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
    </div>
  )
}
