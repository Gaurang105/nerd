import { useState } from 'react'

export function AudioToggle(): React.JSX.Element {
  const [active, setActive] = useState(false)

  const toggle = async (): Promise<void> => {
    if (active) {
      await window.nerd.stopAudio()
    } else {
      await window.nerd.startAudio()
    }
    setActive(!active)
  }

  return (
    <button
      type="button"
      className={`panel-btn audio-toggle${active ? ' audio-toggle--active' : ''}`}
      onClick={toggle}
      title={active ? 'Stop listening' : 'Start listening'}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {active ? '⏹' : '⏺'}
    </button>
  )
}
