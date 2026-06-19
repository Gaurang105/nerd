import { useState, useEffect, useRef } from 'react'
import type { Mode } from '@nerd/shared'

export function ModeSelector(): React.JSX.Element {
  const [modes, setModes] = useState<Mode[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([window.nerd.listModes(), window.nerd.getActiveMode()]).then(([ms, active]) => {
      setModes(ms)
      setActiveId(active.id)
    })
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeName = modes.find((m) => m.id === activeId)?.name ?? '…'

  const select = async (id: string): Promise<void> => {
    await window.nerd.setActiveMode(id)
    setActiveId(id)
    setOpen(false)
  }

  return (
    <div
      ref={ref}
      style={{ position: 'relative', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        type="button"
        className="mode-selector-btn"
        onClick={() => setOpen((o) => !o)}
        title="Switch mode"
      >
        {activeName} ▾
      </button>
      {open && (
        <div className="mode-dropdown">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-option${m.id === activeId ? ' mode-option--active' : ''}`}
              onClick={() => select(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
