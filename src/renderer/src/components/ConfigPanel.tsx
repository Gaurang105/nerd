import { useState } from 'react'
import type { Appearance } from '@shared/types'

interface Props {
  appearance: Appearance
  onAppearanceChange: (a: Appearance) => void
  onRunBriefing: (description: string) => void
  briefingLoading: boolean
}

function ConfigPanel({
  appearance,
  onAppearanceChange,
  onRunBriefing,
  briefingLoading
}: Props): React.JSX.Element {
  const [desc, setDesc] = useState('')
  const set = (patch: Partial<Appearance>): void => onAppearanceChange({ ...appearance, ...patch })

  return (
    <>
      <div className="card">
        <h4>Appearance</h4>
        <div className="config-row">
          <label>Theme</label>
          <button
            className="nerd-btn"
            onClick={() => set({ theme: appearance.theme === 'dark' ? 'light' : 'dark' })}
          >
            {appearance.theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
        <div className="config-row">
          <label>Opacity</label>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.02}
            value={appearance.bgAlpha}
            onChange={(e) => set({ bgAlpha: Number(e.target.value) })}
          />
        </div>
        <div className="config-row">
          <label>Blur</label>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={appearance.blur}
            onChange={(e) => set({ blur: Number(e.target.value) })}
          />
        </div>
        <div className="config-row">
          <label>Font size</label>
          <input
            type="range"
            min={11}
            max={22}
            step={1}
            value={appearance.fontSize}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </div>
        <div className="config-row">
          <label>Accent</label>
          <input
            type="color"
            value={appearance.accent}
            onChange={(e) => set({ accent: e.target.value })}
          />
        </div>
      </div>

      <div className="card">
        <h4>Pre-call briefing</h4>
        <textarea
          className="nerd-textarea"
          rows={3}
          placeholder="Describe your upcoming meeting (e.g. MakeMyTrip SP — API reliability + payout timelines)…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="config-row" style={{ marginTop: 8, marginBottom: 0 }}>
          <span className="sync-line">Generates while you join the call.</span>
          <button
            className="nerd-btn active"
            disabled={briefingLoading || !desc.trim()}
            onClick={() => onRunBriefing(desc.trim())}
          >
            {briefingLoading ? 'Generating…' : 'Generate briefing'}
          </button>
        </div>
      </div>
    </>
  )
}

export default ConfigPanel
