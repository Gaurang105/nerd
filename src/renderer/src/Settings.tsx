import { useEffect, useRef, useState } from 'react'
import './assets/settings.css'
import type { Mode, ShortcutId, ShortcutMap } from '@shared/types'
import { useFitWindow } from './useFitWindow'
import {
  GearIcon,
  ModesIcon,
  CommandIcon,
  PersonIcon,
  PowerIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  EditIcon
} from './components/icons'

export type Tab = 'general' | 'modes' | 'shortcuts' | 'profile'

const TABS: { id: Tab; label: string; Icon: typeof GearIcon }[] = [
  { id: 'general', label: 'General', Icon: GearIcon },
  { id: 'modes', label: 'Modes', Icon: ModesIcon },
  { id: 'shortcuts', label: 'Shortcuts', Icon: CommandIcon },
  { id: 'profile', label: 'Profile', Icon: PersonIcon }
]

const SHORTCUT_DEFS: { id: ShortcutId; label: string }[] = [
  { id: 'openSettings', label: 'Open settings' },
  { id: 'hide', label: 'Hide Nerd' },
  { id: 'toggleSession', label: 'Stop and start Nerd session' },
  { id: 'newChat', label: 'Start new chat' }
]

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={onToggle}
    >
      <span className="knob" />
    </button>
  )
}

function GeneralTab(): React.JSX.Element {
  const [undetectable, setUndetectable] = useState(true)
  const [micLabel, setMicLabel] = useState('Default microphone')

  useEffect(() => {
    void window.nerd.getSettings().then((s) => setUndetectable(s.hidden))
  }, [])

  // Show the input device actually locked in (matches getUserMedia({audio:true})),
  // and keep it in sync when the user plugs/switches devices.
  useEffect(() => {
    const read = async (): Promise<void> => {
      let inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'audioinput'
      )
      // Labels are empty until mic permission is granted; request it once, then re-read.
      if (!inputs.some((d) => d.label)) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
        s?.getTracks().forEach((t) => t.stop())
        inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === 'audioinput'
        )
      }
      const current = inputs.find((d) => d.deviceId === 'default') ?? inputs[0]
      const label = current?.label?.replace(/^Default\s*-\s*/, '').trim()
      setMicLabel(label || 'Default microphone')
    }
    void read()
    const onChange = (): void => void read()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [])

  const toggleUndetectable = (): void => {
    const next = !undetectable
    setUndetectable(next)
    void window.nerd.setHidden(next)
  }

  return (
    <>
      <div className="settings-content">
        <div className="general-rows">
          <div className="setting-row">
            <div className="meta">
              <span className="label">Undetectability</span>
              <span className="desc">Off means Nerd is detectable by screen sharing</span>
            </div>
            <Toggle on={undetectable} onToggle={toggleUndetectable} />
          </div>
          <div className="setting-row">
            <div className="meta">
              <span className="label">Audio</span>
              <span className="desc">Microphone source: {micLabel}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="settings-footer">
        <button className="footer-action" onClick={() => window.close()}>
          <PowerIcon size={16} />
          Quit
        </button>
      </div>
    </>
  )
}

function ModesTab({ onModesChanged }: { onModesChanged: (m: Mode[]) => void }): React.JSX.Element {
  const [modes, setModesState] = useState<Mode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const setModes = (m: Mode[]): void => {
    setModesState(m)
    onModesChanged(m)
  }

  useEffect(() => {
    void window.nerd.listModes().then((m) => {
      setModesState(m)
      setSelectedId((cur) => cur ?? m[0]?.id ?? null)
    })
  }, [])

  const selected = modes.find((m) => m.id === selectedId) ?? null

  const patchSelected = (patch: Partial<Mode>): void => {
    if (!selected) return
    setModesState((ms) => ms.map((m) => (m.id === selected.id ? { ...m, ...patch } : m)))
  }

  const persist = async (): Promise<void> => {
    if (!selected) return
    setModes(await window.nerd.updateMode(selected))
  }

  const addMode = async (): Promise<void> => {
    const next = await window.nerd.createMode('New mode', '')
    setModes(next)
    setSelectedId(next[next.length - 1]?.id ?? null)
  }

  const deleteSelected = async (): Promise<void> => {
    if (!selected) return
    const next = await window.nerd.deleteMode(selected.id)
    setModes(next)
    setSelectedId(next[0]?.id ?? null)
  }

  const activate = async (): Promise<void> => {
    if (!selected) return
    setModes(await window.nerd.setActiveMode(selected.id))
  }

  return (
    <>
      <div className="settings-content">
        <div className="modes-layout">
          <div className="modes-list">
            {modes.length === 0 && <span className="modes-empty">No modes yet</span>}
            {modes.map((m) => (
              <button
                key={m.id}
                className={`mode-list-item ${m.id === selectedId ? 'active' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="modes-detail">
            {selected ? (
              <>
                <input
                  className="mode-title"
                  value={selected.name}
                  onChange={(e) => patchSelected({ name: e.target.value })}
                  onBlur={() => void persist()}
                />
                <textarea
                  className="mode-desc"
                  placeholder="Custom system prompt that replaces the default behavior…"
                  value={selected.systemPrompt}
                  onChange={(e) => patchSelected({ systemPrompt: e.target.value })}
                  onBlur={() => void persist()}
                />
              </>
            ) : (
              <span className="modes-empty">Add a mode to get started.</span>
            )}
          </div>
        </div>
      </div>
      <div className="settings-footer">
        {selected && selected.isDefault ? (
          <span className="footer-action">
            <CheckIcon size={16} />
            Active
          </span>
        ) : (
          <button className="footer-action" disabled={!selected} onClick={() => void activate()}>
            <CheckIcon size={16} />
            Set Active
          </button>
        )}
        {selected && (
          <button className="footer-action" onClick={() => void deleteSelected()}>
            <TrashIcon size={16} />
            Delete mode
          </button>
        )}
        <button className="footer-action" onClick={() => void addMode()}>
          <PlusIcon size={16} />
          Add new mode
        </button>
      </div>
    </>
  )
}

function ShortcutsTab(): React.JSX.Element {
  const [keys, setKeys] = useState<ShortcutMap | null>(null)
  const [editing, setEditing] = useState(false)
  const [capturing, setCapturing] = useState<ShortcutId | null>(null)

  useEffect(() => {
    void window.nerd.getSettings().then((s) => setKeys(s.shortcuts))
  }, [])

  // While capturing, the next printable key becomes the new binding (Esc cancels).
  // Capture phase + stopPropagation so Esc doesn't also close Settings.
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key.length !== 1) return
      const key = e.key.toLowerCase()
      setKeys((k) => (k ? { ...k, [capturing]: key } : k))
      void window.nerd.setShortcut(capturing, key)
      setCapturing(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [capturing])

  return (
    <>
      <div className="settings-content">
        <div className="shortcuts-rows">
          {SHORTCUT_DEFS.map((s) => (
            <div className="shortcut-row" key={s.id}>
              <span className="label">{s.label}</span>
              <div className="key-combo">
                <span className="key-chip">
                  <CommandIcon size={16} />
                </span>
                <button
                  className={`key-chip ${editing ? 'editable' : ''} ${capturing === s.id ? 'capturing' : ''}`}
                  disabled={!editing}
                  onClick={() => setCapturing(s.id)}
                >
                  {capturing === s.id ? '…' : keys ? keys[s.id] : ''}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="settings-footer">
        <button
          className={`footer-action ${editing ? 'active' : ''}`}
          onClick={() => {
            setEditing((v) => !v)
            setCapturing(null)
          }}
        >
          <EditIcon size={16} />
          {editing ? 'Done' : 'Edit shortcuts'}
        </button>
      </div>
    </>
  )
}

function ProfileTab(): React.JSX.Element {
  return (
    <div className="settings-content">
      <div className="profile-placeholder">
        <PersonIcon size={32} />
        <span>Profile settings coming soon</span>
      </div>
    </div>
  )
}

interface SettingsProps {
  onClose: () => void
  onModesChanged: (m: Mode[]) => void
  initialTab?: Tab
}

function Settings({
  onClose,
  onModesChanged,
  initialTab = 'general'
}: SettingsProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab)
  const rootRef = useRef<HTMLDivElement>(null)
  useFitWindow(rootRef, 600)

  // Design has no back button; Esc exits Settings back to the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const renderTab = (): React.JSX.Element => {
    switch (tab) {
      case 'general':
        return <GeneralTab />
      case 'modes':
        return <ModesTab onModesChanged={onModesChanged} />
      case 'shortcuts':
        return <ShortcutsTab />
      case 'profile':
        return <ProfileTab />
      default: {
        const _exhaustive: never = tab
        return _exhaustive
      }
    }
  }

  return (
    <div className="settings" ref={rootRef}>
      <div>
        <div className="settings-head">
          <p className="settings-title">Nerd Settings</p>
        </div>
        <div className="settings-tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`settings-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {renderTab()}
    </div>
  )
}

export default Settings
