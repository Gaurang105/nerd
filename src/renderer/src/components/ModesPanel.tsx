import { useState } from 'react'
import type { Mode } from '@shared/types'

interface Props {
  modes: Mode[]
  onChange: (modes: Mode[]) => void
}

function ModesPanel({ modes, onChange }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')

  const create = async (): Promise<void> => {
    if (!name.trim() || !prompt.trim()) return
    onChange(await window.nerd.createMode(name.trim(), prompt.trim()))
    setName('')
    setPrompt('')
  }

  return (
    <div className="card">
      <h4>Modes (custom system prompt)</h4>
      {modes.length === 0 && (
        <div className="sync-line">No modes yet — the default prompt is in use.</div>
      )}
      {modes.map((m) => (
        <div className="briefing-q" key={m.id}>
          <div className="mode-row">
            <button
              className={`nerd-btn ${m.isDefault ? 'active' : ''}`}
              title="Use this mode"
              onClick={async () => onChange(await window.nerd.setActiveMode(m.id))}
            >
              {m.isDefault ? 'Active' : 'Use'}
            </button>
            <input
              className="nerd-input"
              value={m.name}
              onChange={(e) =>
                onChange(modes.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))
              }
              onBlur={async () => onChange(await window.nerd.updateMode(m))}
            />
            <button
              className="nerd-btn"
              title="Delete"
              onClick={async () => onChange(await window.nerd.deleteMode(m.id))}
            >
              ×
            </button>
          </div>
          <textarea
            className="nerd-textarea"
            rows={2}
            value={m.systemPrompt}
            onChange={(e) =>
              onChange(
                modes.map((x) => (x.id === m.id ? { ...x, systemPrompt: e.target.value } : x))
              )
            }
            onBlur={async () => onChange(await window.nerd.updateMode(m))}
          />
        </div>
      ))}
      <div className="briefing-q">
        <input
          className="nerd-input"
          placeholder="New mode name (e.g. Terse leadership)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="nerd-textarea"
          rows={2}
          placeholder="Custom system prompt that replaces the default…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ marginTop: 6 }}
        />
        <div className="config-row" style={{ marginTop: 6, marginBottom: 0 }}>
          <span className="sync-line">Replaces the default generation persona.</span>
          <button
            className="nerd-btn active"
            disabled={!name.trim() || !prompt.trim()}
            onClick={create}
          >
            Add mode
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModesPanel
